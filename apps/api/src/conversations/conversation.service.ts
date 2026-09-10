import { AppError } from "../common/errors.js";
import { ConversationModel } from "../models/conversation.model.js";
import { UserModel } from "../models/user.model.js";
import { isValidObjectId } from "mongoose";
import type { AuthUser } from "../auth/auth.service.js";
import { conversationAccessFilter } from "../realtime/access.js";

export async function listConversations(query: {
  page?: string;
  limit?: string;
  platform?: string;
  status?: string;
}, auth?: AuthUser) {
  const page = parsePositiveInt(query.page, 1);
  const limit = Math.min(100, parsePositiveInt(query.limit, 20));
  const filter: Record<string, unknown> = {};
  if (query.platform) filter.platform = query.platform;
  if (query.status) filter.status = query.status;
  if (auth) Object.assign(filter, conversationAccessFilter(auth));
  const [rows, total] = await Promise.all([
    ConversationModel.find(filter).populate("customerId", "name avatarUrl").sort({ lastMessageAt: -1, _id: 1 }).skip((page - 1) * limit).limit(limit).lean(),
    ConversationModel.countDocuments(filter)
  ]);
  return { conversations: rows.map(toConversation), total };
}

export async function updateAssignment(id: string, assignedAgentId: string | null) {
  if (assignedAgentId !== null && (!isValidObjectId(assignedAgentId) || !(await UserModel.exists({ _id: assignedAgentId, role: "agent" })))) {
    throw new AppError(400, "INVALID_AGENT", "assignedAgentId must identify an agent");
  }
  const row = await ConversationModel.findByIdAndUpdate(id, { assignedAgentId }, { new: true }).populate("customerId", "name avatarUrl").lean();
  if (!row) throw new AppError(404, "CONVERSATION_NOT_FOUND", "Conversation was not found");
  return toConversation(row);
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value) || Number(value) < 1) throw new AppError(400, "INVALID_PAGINATION", "page and limit must be positive integers");
  return Number(value);
}

export async function updateStatus(id: string, status: "open" | "pending" | "closed") {
  const row = await ConversationModel.findByIdAndUpdate(id, { status }, { new: true }).populate("customerId", "name avatarUrl").lean();
  if (!row) throw new AppError(404, "CONVERSATION_NOT_FOUND", "Conversation was not found");
  return toConversation(row);
}

// Clears unread state only when the authenticated user is allowed to access this conversation.
export async function markConversationRead(id: string, auth: AuthUser) {
  const accessFilter = conversationAccessFilter(auth);
  const row = await ConversationModel.findOneAndUpdate({ _id: id, ...accessFilter }, { unreadCount: 0 }, { new: true }).populate("customerId", "name avatarUrl").lean();
  if (!row) throw new AppError(404, "CONVERSATION_NOT_FOUND", "Conversation was not found");
  return toConversation(row);
}

// Normalizes populated and unpopulated Mongo documents into the frontend conversation contract.
export function toConversation(row: any) {
  const customer = row.customerId && typeof row.customerId === "object" ? row.customerId : null;
  return {
    id: String(row._id), customerId: String(customer?._id ?? row.customerId), platform: row.platform,
    channelId: row.channelId, assignedAgentId: row.assignedAgentId ? String(row.assignedAgentId) : null,
    unreadCount: row.unreadCount, status: row.status,
    lastMessageAt: new Date(row.lastMessageAt).toISOString(), lastMessageSnippet: row.lastMessageSnippet,
    customerName: customer?.name ?? row.customerName ?? undefined,
    customerAvatarUrl: customer?.avatarUrl ?? row.customerAvatarUrl ?? undefined,
    conversationName: row.conversationName ?? null,
    conversationType: row.conversationType ?? "private"
  };
}
