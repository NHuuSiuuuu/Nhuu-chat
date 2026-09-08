import { AppError } from "../common/errors.js";
import { MessageModel } from "../models/message.model.js";

export async function listMessages(conversationId: string, query: { page?: string; limit?: string }) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 50));
  const filter = { conversationId };
  const [rows, total] = await Promise.all([
    MessageModel.find(filter).sort({ createdAt: 1, _id: 1 }).skip((page - 1) * limit).limit(limit).lean(),
    MessageModel.countDocuments(filter)
  ]);
  return { messages: rows.map(toMessage), total };
}

export function toMessage(row: any) {
  return {
    id: String(row._id), conversationId: String(row.conversationId), platform: row.platform,
    senderType: row.senderType, senderId: row.senderId, type: row.type, content: row.content,
    deliveryStatus: row.deliveryStatus, createdAt: new Date(row.createdAt).toISOString()
  };
}

export async function createOutboundMessage(input: { conversationId: string; platform: string; senderId: string; content: string; externalMessageId?: string; deliveryStatus: "pending" | "sent" | "failed" }) {
  if (!input.content.trim()) throw new AppError(400, "INVALID_REQUEST", "content is required");
  return MessageModel.create({ ...input, senderType: "agent", type: "text" });
}
