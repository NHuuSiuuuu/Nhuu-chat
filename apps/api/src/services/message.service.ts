import { TelegramClient } from "../channels/telegram/telegram.client.js";
import { AppError } from "../common/errors.js";
import { ConversationModel } from "../models/conversation.model.js";
import { MessageModel } from "../models/message.model.js";
import { pauseBot } from "../orchestration/bot-pause.service.js";
import { canJoinConversation } from "../realtime/access.js";
import type { AuthUser } from "./auth.service.js";
import { toConversation } from "./conversation.service.js";
import { readProviderSecretByName } from "./provider-secret.service.js";

export async function listMessages(conversationId: string, query: { page?: string; limit?: string }) {
  const page = parsePositiveInt(query.page, 1);
  const limit = Math.min(100, parsePositiveInt(query.limit, 50));
  const filter = { conversationId };
  const [rows, total] = await Promise.all([
    MessageModel.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    MessageModel.countDocuments(filter)
  ]);
  return { messages: rows.reverse().map(toMessage), total };
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value) || Number(value) < 1) throw new AppError(400, "INVALID_PAGINATION", "page and limit must be positive integers");
  return Number(value);
}

export function toMessage(row: any) {
  return {
    id: String(row._id), conversationId: String(row.conversationId), platform: row.platform,
    senderType: row.senderType, senderId: row.senderId, senderName: row.metadata?.senderName, type: row.type, content: row.content,
    deliveryStatus: row.deliveryStatus, createdAt: new Date(row.createdAt).toISOString()
  };
}

export async function createOutboundMessage(input: { conversationId: string; platform: string; senderId: string; content: string; externalMessageId?: string; deliveryStatus: "pending" | "sent" | "failed" }) {
  if (!input.content.trim()) throw new AppError(400, "INVALID_REQUEST", "content is required");
  return MessageModel.create({ ...input, senderType: "agent", type: "text" });
}

export async function sendOutboundMessage(
  input: { conversationId: string; content: string },
  auth?: AuthUser
) {
  const { conversationId, content } = input;
  const conversation = await ConversationModel.findById(conversationId)
    .populate("customerId", "name avatarUrl")
    .lean();
  if (!conversation) {
    throw new AppError(404, "CONVERSATION_NOT_FOUND", "Conversation was not found");
  }
  if (!auth || !canJoinConversation(auth, conversation)) {
    throw new AppError(403, "FORBIDDEN", "You do not have access to this conversation");
  }

  if (conversation.platform === "telegram_personal" && String(conversation.ownerId) !== auth.id) {
    throw new AppError(403, "FORBIDDEN", "You do not own this Telegram connection");
  }
  // Tạm dừng bot sau kiểm tra quyền và trước connector để nhân viên tiếp quản cả khi gửi bị lỗi.
  await pauseBot(conversationId, new Date());
  let deliveryStatus: "pending" | "sent" | "failed" = "sent";
  let externalMessageId: string | undefined;
  if (conversation.platform === "telegram_personal") {
    const userId = auth.id;
    // Connector cá nhân dùng toMessage cho tin đến; chỉ nạp khi gửi để tránh import vòng.
    const { getActivePersonalClient } = await import("./telegram-personal.service.js");
    const client = await getActivePersonalClient(userId);
    if (!client) {
      throw new AppError(409, "TELEGRAM_PERSONAL_DISCONNECTED", "Telegram personal session is not active");
    }
    const sent = await client.sendMessage(conversation.channelId, { message: content });
    externalMessageId = String(sent.id);
  } else if (conversation.platform === "telegram") {
    const botToken = await readProviderSecretByName("telegram", "bot-token");
    const delivery = await new TelegramClient(botToken).sendText(conversation.channelId, content);
    externalMessageId = delivery.externalMessageId;
  } else {
    deliveryStatus = "pending";
  }

  const message = await createOutboundMessage({
    conversationId,
    platform: conversation.platform,
    senderId: "agent",
    content,
    externalMessageId,
    deliveryStatus
  });

  return {
    message: toMessage(message.toObject()),
    conversation: toConversation({
      ...conversation,
      lastMessageAt: new Date(),
      lastMessageSnippet: content
    }),
    recipients: [
      conversation.ownerId ? String(conversation.ownerId) : "",
      conversation.assignedAgentId ? String(conversation.assignedAgentId) : ""
    ]
  };
}
