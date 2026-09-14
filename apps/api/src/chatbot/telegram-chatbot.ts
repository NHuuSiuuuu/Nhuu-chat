import { TelegramClient } from "../channels/telegram/telegram.client.js";
import { TelegramPersonalSessionModel } from "../channels/telegram-personal/telegram-personal.model.js";
import { readProviderSecretByName } from "../services/provider-secret.service.js";
import { ProviderSecretModel } from "../models/provider-secret.model.js";
import { BotDeliveryService } from "./bot-delivery.service.js";
import { withBotTimeout, type ResolveBotAdapter } from "./channel-bot-adapter.js";
import { ChatbotOrchestrator } from "./chatbot-orchestrator.js";

const personalBotSends = new Map<string, Set<Promise<string>>>();
const personalBotSentIds = new Map<string, Set<string>>();

// Đối chiếu ID thật kể cả echo đến trước kết quả gửi; không bỏ nhầm tin nhân viên có cùng nội dung.
export async function isTelegramPersonalBotEcho(ownerId: string, channelId: string, externalMessageId: string): Promise<boolean> {
  const key = `${ownerId}:${channelId}`;
  if (personalBotSentIds.get(key)?.has(externalMessageId)) return true;
  const pending = personalBotSends.get(key);
  if (!pending) return false;
  const results = await Promise.allSettled([...pending]);
  return results.some((result) => result.status === "fulfilled" && result.value === externalMessageId);
}

// Chỉ đăng ký hai connector thật; session cá nhân luôn được chọn theo owner đã xác thực.
export const resolveTelegramBotAdapter: ResolveBotAdapter = async ({ platform, ownerId }) => {
  if (platform === "telegram") {
    const registration = await ProviderSecretModel.findOne({ provider: "telegram", name: "bot-token" }).lean();
    if (registration?.ownerId && String(registration.ownerId) !== ownerId) return undefined;
    const token = await readProviderSecretByName("telegram", "bot-token");
    const client = new TelegramClient(token);
    return { sendText: ({ channelId, content }) => client.sendText(channelId, content) };
  }
  if (platform === "telegram_personal") {
    if (!(await TelegramPersonalSessionModel.exists({ userId: ownerId, status: "active" }))) return undefined;
    // Nạp muộn để listener inbound có thể dùng chung runtime mà không tạo import vòng.
    const { getActivePersonalClient } = await import("../services/telegram-personal.service.js");
    const client = await getActivePersonalClient(ownerId);
    if (!client) return undefined;
    return {
      sendText: async ({ channelId, content }) => {
        const key = `${ownerId}:${channelId}`;
        const pending = personalBotSends.get(key) ?? new Set<Promise<string>>();
        personalBotSends.set(key, pending);
        // Theo dõi kết quả gốc riêng với timeout để vẫn nhận diện lần gửi thành công đến muộn.
        const externalSend = Promise.resolve().then(() => client.sendMessage(channelId, { message: content })).then((message) => {
          const id = String(message.id);
          const ids = personalBotSentIds.get(key) ?? new Set<string>();
          personalBotSentIds.set(key, ids);
          ids.add(id);
          setTimeout(() => {
            ids.delete(id);
            if (ids.size === 0) personalBotSentIds.delete(key);
          }, 10_000).unref();
          return id;
        });
        const sent = withBotTimeout(() => externalSend, 10_000);
        pending.add(sent);
        try {
          return { externalMessageId: await sent };
        } finally {
          // Giữ ID ngắn hạn qua khoảng trễ ghi delivery; sau đó MongoDB tiếp tục chống trùng.
          setTimeout(() => {
            pending.delete(sent);
            if (pending.size === 0) personalBotSends.delete(key);
          }, 10_000).unref();
        }
      }
    };
  }
  return undefined;
};

export const telegramChatbot = new ChatbotOrchestrator({
  delivery: new BotDeliveryService({ resolveAdapter: resolveTelegramBotAdapter })
});
