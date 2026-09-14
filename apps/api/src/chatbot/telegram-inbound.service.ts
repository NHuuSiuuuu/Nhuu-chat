import { ConversationModel } from "../models/conversation.model.js";
import { MessageModel } from "../models/message.model.js";
import { emitInboxEventToRecipients } from "../realtime/socket.js";
import { toConversation } from "../services/conversation.service.js";
import type { NormalizedCustomerMessage } from "./channel-bot-adapter.js";
import { telegramChatbot } from "./telegram-chatbot.js";

// Caller cung cấp tin khách đã lưu; ghi lỗi cả khi chưa tạo claim, không làm webhook gửi lại.
export async function processTelegramCustomerMessage(input: NormalizedCustomerMessage): Promise<void> {
  try {
    if ((await telegramChatbot.process(input)).status !== "failed") return;
  } catch {
    // Không lưu lỗi gốc vì có thể chứa token, session hoặc nội dung khách hàng.
  }
  const code = "PROCESSING_FAILED";
  const now = new Date();
  // Hai lần ghi độc lập để lỗi diagnostics không cản bàn giao và ngược lại.
  const [diagnostic, handoff] = await Promise.allSettled([
    Promise.resolve().then(() => MessageModel.updateOne(
      { _id: input.customerMessageId, conversationId: input.conversationId, platform: input.platform, senderType: "customer" },
      { $set: { "metadata.botFailure": { code, recordedAt: now } } }
    )),
    Promise.resolve().then(() => ConversationModel.findOneAndUpdate(
      { _id: input.conversationId, ownerId: input.ownerId, platform: input.platform, channelId: input.channelId },
      { $set: { status: "pending" }, $max: { botPausedUntil: new Date(now.getTime() + 1_800_000) } },
      { returnDocument: "after" }
    ).populate("customerId", "name avatarUrl").populate("tagIds", "name color").lean())
  ]);
  console.error("TELEGRAM_CHATBOT_FAILURE", {
    code,
    ownerId: input.ownerId,
    conversationId: input.conversationId,
    customerMessageId: input.customerMessageId,
    platform: input.platform,
    diagnosticPersisted: diagnostic.status === "fulfilled" && diagnostic.value.matchedCount === 1,
    handoffPersisted: handoff.status === "fulfilled" && Boolean(handoff.value)
  });
  if (handoff.status === "fulfilled" && handoff.value) {
    try {
      emitInboxEventToRecipients("chat:conversation_updated", [input.ownerId, handoff.value.assignedAgentId ? String(handoff.value.assignedAgentId) : ""], toConversation(handoff.value));
    } catch {
      // Lỗi realtime không thay đổi kết quả đã lưu hoặc kích hoạt gửi lại.
    }
  }
}
