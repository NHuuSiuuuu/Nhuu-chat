import { AppError } from "../common/errors.js";
import { ConversationModel } from "../models/conversation.model.js";
import { UserModel } from "../models/user.model.js";
import { isValidObjectId } from "mongoose";
import type { AuthUser } from "./auth.service.js";
import { conversationAccessFilter } from "../realtime/access.js";
import { TelegramPersonalSessionModel } from "../channels/telegram-personal/telegram-personal.model.js";
import { ConversationTagModel } from "../models/conversation-tag.model.js";
import { MessageModel } from "../models/message.model.js";
import type { AiSuggestionsResponse } from "@nhuu-chat/contracts";

const LOCAL_REPLY_SUGGESTIONS = [
  "Dạ, em đã nhận được thông tin của anh/chị ạ.",
  "Anh/chị đợi em một chút để em kiểm tra lại nhé.",
  "Em sẽ phản hồi lại anh/chị trong ít phút ạ."
];

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
    ConversationModel.find(filter).populate("customerId", "name avatarUrl").populate("tagIds", "name color").sort({ lastMessageAt: -1, _id: 1 }).skip((page - 1) * limit).limit(limit).lean(),
    ConversationModel.countDocuments(filter)
  ]);
  const ownerIds = rows
    .filter((row) => row.platform === "telegram_personal" && row.ownerId)
    .map((row) => String(row.ownerId));
  const sessions = ownerIds.length > 0
    ? await TelegramPersonalSessionModel.find({ userId: { $in: ownerIds }, status: "active" }).lean()
    : [];
  const accountByOwnerId = new Map(sessions.map((session) => [String(session.userId), { name: session.displayName, avatarUrl: undefined }]));
  return {
    conversations: rows.map((row) => toConversation(row, row.ownerId ? accountByOwnerId.get(String(row.ownerId)) : undefined)),
    total
  };
}

export async function updateAssignment(id: string, assignedAgentId: string | null) {
  if (assignedAgentId !== null && (!isValidObjectId(assignedAgentId) || !(await UserModel.exists({ _id: assignedAgentId, role: "agent" })))) {
    throw new AppError(400, "INVALID_AGENT", "assignedAgentId must identify an agent");
  }
  const row = await ConversationModel.findByIdAndUpdate(id, { assignedAgentId }, { new: true }).populate("customerId", "name avatarUrl").populate("tagIds", "name color").lean();
  if (!row) throw new AppError(404, "CONVERSATION_NOT_FOUND", "Conversation was not found");
  return toConversation(row);
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value) || Number(value) < 1) throw new AppError(400, "INVALID_PAGINATION", "page and limit must be positive integers");
  return Number(value);
}

export async function updateStatus(id: string, status: "open" | "pending" | "closed") {
  const row = await ConversationModel.findByIdAndUpdate(id, { status }, { new: true }).populate("customerId", "name avatarUrl").populate("tagIds", "name color").lean();
  if (!row) throw new AppError(404, "CONVERSATION_NOT_FOUND", "Conversation was not found");
  return toConversation(row);
}

// Clears unread state only when the authenticated user is allowed to access this conversation.
export async function markConversationRead(id: string, auth: AuthUser) {
  const accessFilter = conversationAccessFilter(auth);
  const row = await ConversationModel.findOneAndUpdate({ _id: id, ...accessFilter }, { unreadCount: 0 }, { new: true }).populate("customerId", "name avatarUrl").populate("tagIds", "name color").lean();
  if (!row) throw new AppError(404, "CONVERSATION_NOT_FOUND", "Conversation was not found");
  return toConversation(row);
}

// Replaces all tags atomically after checking tag existence and conversation access.
export async function updateConversationTags(id: string, tagIds: string[], auth: AuthUser) {
  const uniqueTagIds = [...new Set(tagIds)];
  if (uniqueTagIds.some((tagId) => !isValidObjectId(tagId))) {
    throw new AppError(400, "CONVERSATION_TAG_NOT_FOUND", "One or more conversation tags were not found");
  }
  const tagCount = await ConversationTagModel.countDocuments({ _id: { $in: uniqueTagIds } });
  if (tagCount !== uniqueTagIds.length) {
    throw new AppError(400, "CONVERSATION_TAG_NOT_FOUND", "One or more conversation tags were not found");
  }
  const row = await ConversationModel.findOneAndUpdate(
    { _id: id, ...conversationAccessFilter(auth) },
    { $set: { tagIds: uniqueTagIds } },
    { new: true }
  ).populate("customerId", "name avatarUrl").populate("tagIds", "name color").lean();
  if (!row) throw new AppError(404, "CONVERSATION_NOT_FOUND", "Conversation was not found");
  return toConversation(row);
}

// Checks conversation visibility before loading any customer content for the AI request.
export async function getConversationReplySuggestions(id: string, auth: AuthUser): Promise<AiSuggestionsResponse> {
  const conversation = await ConversationModel.findOne({ _id: id, ...conversationAccessFilter(auth) }).lean();
  if (!conversation) throw new AppError(404, "CONVERSATION_NOT_FOUND", "Conversation was not found");

  const latestCustomerMessage = await MessageModel.findOne({ conversationId: id, senderType: "customer" })
    .sort({ createdAt: -1, _id: -1 })
    .lean();
  const content = typeof latestCustomerMessage?.content === "string" ? latestCustomerMessage.content.trim() : "";
  if (!content) return localReplySuggestions();

  try {
    const { GeminiReplySuggestionProvider } = await import("../ai/reply-suggestion.provider.js");
    const suggestions = await new GeminiReplySuggestionProvider().suggest({ latestCustomerMessage: content });
    return { suggestions: suggestions.slice(0, 3), source: "gemini" };
  } catch {
    // Provider and configuration failures stay internal so agents always receive usable replies.
    return localReplySuggestions();
  }
}

function localReplySuggestions(): AiSuggestionsResponse {
  return { suggestions: [...LOCAL_REPLY_SUGGESTIONS], source: "fallback" };
}

// Normalizes populated and unpopulated Mongo documents into the frontend conversation contract.
export function toConversation(row: any, account?: { name?: string; avatarUrl?: string }) {
  const customer = row.customerId && typeof row.customerId === "object" ? row.customerId : null;
  const tags = Array.isArray(row.tagIds)
    ? row.tagIds.filter((tag: any) => tag && typeof tag === "object" && tag.name && tag.color).map((tag: any) => ({ id: String(tag._id ?? tag.id), name: tag.name, color: tag.color }))
    : [];
  const result: any = {
    id: String(row._id), customerId: String(customer?._id ?? row.customerId), platform: row.platform,
    channelId: row.channelId, assignedAgentId: row.assignedAgentId ? String(row.assignedAgentId) : null,
    unreadCount: row.unreadCount, status: row.status,
    lastMessageAt: new Date(row.lastMessageAt).toISOString(), lastMessageSnippet: row.lastMessageSnippet,
    customerName: customer?.name ?? row.customerName ?? undefined,
    customerAvatarUrl: customer?.avatarUrl ?? row.customerAvatarUrl ?? undefined,
    conversationName: row.conversationName ?? null,
    conversationType: row.conversationType ?? "private"
  };
  const accountName = account?.name ?? row.accountName;
  const accountAvatarUrl = account?.avatarUrl ?? row.accountAvatarUrl;
  if (accountName !== undefined) result.accountName = accountName;
  if (accountAvatarUrl !== undefined) result.accountAvatarUrl = accountAvatarUrl;
  if (Array.isArray(row.tagIds)) result.tags = tags;
  return result;
}
