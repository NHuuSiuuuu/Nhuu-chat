import { AppError } from "../common/errors.js";
import { ConversationModel } from "../models/conversation.model.js";

export async function listConversations(query: {
  page?: string;
  limit?: string;
  platform?: string;
  status?: string;
}) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
  const filter: Record<string, unknown> = {};
  if (query.platform) filter.platform = query.platform;
  if (query.status) filter.status = query.status;
  const [rows, total] = await Promise.all([
    ConversationModel.find(filter).sort({ lastMessageAt: -1, _id: 1 }).skip((page - 1) * limit).limit(limit).lean(),
    ConversationModel.countDocuments(filter)
  ]);
  return { conversations: rows.map(toConversation), total };
}

export async function updateAssignment(id: string, assignedAgentId: string | null) {
  const row = await ConversationModel.findByIdAndUpdate(id, { assignedAgentId }, { new: true }).lean();
  if (!row) throw new AppError(404, "CONVERSATION_NOT_FOUND", "Conversation was not found");
  return toConversation(row);
}

export async function updateStatus(id: string, status: "open" | "pending" | "closed") {
  const row = await ConversationModel.findByIdAndUpdate(id, { status }, { new: true }).lean();
  if (!row) throw new AppError(404, "CONVERSATION_NOT_FOUND", "Conversation was not found");
  return toConversation(row);
}

export function toConversation(row: any) {
  return {
    id: String(row._id), customerId: String(row.customerId), platform: row.platform,
    channelId: row.channelId, assignedAgentId: row.assignedAgentId ? String(row.assignedAgentId) : null,
    unreadCount: row.unreadCount, status: row.status,
    lastMessageAt: new Date(row.lastMessageAt).toISOString(), lastMessageSnippet: row.lastMessageSnippet
  };
}
