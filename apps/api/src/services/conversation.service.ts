import { AppError } from "../common/errors.js";
import { describeExternalError } from "../common/external-error.js";
import { ConversationModel } from "../models/conversation.model.js";
import { WorkspaceMemberModel } from "../models/workspace-member.model.js";
import { UserModel } from "../models/user.model.js";
import { isValidObjectId } from "mongoose";
import type { AuthUser } from "./auth.service.js";
import { conversationAccessFilter } from "../realtime/access.js";
import { TelegramPersonalSessionModel } from "../channels/telegram-personal/telegram-personal.model.js";
import { ConversationTagModel } from "../models/conversation-tag.model.js";
import { MessageModel } from "../models/message.model.js";
import { ConversationNoteModel } from "../models/conversation-note.model.js";
import { BotProcessingModel } from "../models/bot-processing.model.js";
import type { AiSuggestionsResponse } from "@nhuu-chat/contracts";
import { shouldGenerateSuggestions, type AiSuggestionTrigger } from "../ai/ai-settings.js";
import { getAiSettings } from "./ai-settings.service.js";
import { pauseBot } from "../orchestration/bot-pause.service.js";

const REPLY_SUGGESTION_CONTEXT_SIZE = 6;

export async function listConversations(query: {
  page?: string;
  limit?: string;
  platform?: string;
  channelId?: string;
  status?: string;
}, auth?: AuthUser) {
  const page = parsePositiveInt(query.page, 1);
  const limit = Math.min(100, parsePositiveInt(query.limit, 20));
  const filter: Record<string, unknown> = {};
  if (query.platform) filter.platform = query.platform;
  if (query.channelId) filter.channelId = query.channelId;
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
  const accountByOwnerId = new Map(sessions.map((session) => [String(session.userId), { name: session.displayName, avatarUrl: session.avatarUrl ?? undefined }]));
  return {
    conversations: rows.map((row) => toConversation(row, row.ownerId ? accountByOwnerId.get(String(row.ownerId)) : undefined)),
    total
  };
}

export async function updateAssignment(id: string, assignedAgentId: string | null, workspaceId?: string) {
  const isSystemAgent = assignedAgentId !== null && isValidObjectId(assignedAgentId) && await UserModel.exists({ _id: assignedAgentId, role: "agent" });
  const isWorkspaceMember = assignedAgentId !== null && workspaceId && isValidObjectId(assignedAgentId)
    ? await WorkspaceMemberModel.exists({ workspaceId, userId: assignedAgentId })
    : false;
  if (assignedAgentId !== null && !isSystemAgent && !isWorkspaceMember) {
    throw new AppError(400, "INVALID_AGENT", "assignedAgentId must identify an agent");
  }
  const update = assignedAgentId === null
    ? { assignedAgentId }
    : { $set: { assignedAgentId, botEnabled: false } };
  const row = await ConversationModel.findByIdAndUpdate(id, update, { new: true }).populate("customerId", "name avatarUrl").populate("tagIds", "name color").lean();
  if (!row) throw new AppError(404, "CONVERSATION_NOT_FOUND", "Conversation was not found");
  // Khi nhân viên nhận hội thoại, khóa bot ngay để không phát sinh câu trả lời song song.
  if (assignedAgentId !== null) await pauseBot(id, new Date());
  return toConversation(row);
}

// Lưu công tắc bot theo từng hội thoại; bật lại thì xóa pause tạm thời để bot hoạt động ngay.
export async function updateBotEnabled(id: string, botEnabled: boolean) {
  const update = botEnabled
    ? { $set: { botEnabled: true, botPausedUntil: null } }
    : { $set: { botEnabled: false } };
  const row = await ConversationModel.findByIdAndUpdate(id, update, { new: true }).populate("customerId", "name avatarUrl").populate("tagIds", "name color").lean();
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

// Xử lý trọn một lô hội thoại sau khi xác nhận người gọi có quyền với mọi ID.
export async function bulkConversationActions(ids: string[], action: "read" | "unread" | "delete", auth: AuthUser) {
  const filter = { _id: { $in: ids }, ...conversationAccessFilter(auth) };
  const accessible = await ConversationModel.find(filter).lean();
  if (accessible.length !== ids.length) throw new AppError(404, "CONVERSATION_NOT_FOUND", "One or more conversations were not found");

  if (action === "delete") {
    await ConversationModel.db.transaction(async (session) => {
      await MessageModel.deleteMany({ conversationId: { $in: ids } }, { session });
      await ConversationNoteModel.deleteMany({ conversationId: { $in: ids } }, { session });
      await BotProcessingModel.deleteMany({ conversationId: { $in: ids } }, { session });
      await ConversationModel.deleteMany(filter, { session });
    });
    return { action, conversations: accessible.map((row: any) => ({ id: String(row._id), platform: row.platform, ownerId: String(row.ownerId ?? ""), channelId: row.channelId, assignedAgentId: row.assignedAgentId ? String(row.assignedAgentId) : null })) };
  }

  await ConversationModel.updateMany(filter, { $set: { unreadCount: action === "read" ? 0 : 1 } });
  const rows = await ConversationModel.find(filter).populate("customerId", "name avatarUrl").populate("tagIds", "name color").sort({ lastMessageAt: -1 }).lean();
  return { action, conversations: rows.map((row: any) => toConversation(row)) };
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

// Builds a bounded chronological context from both sides of the conversation after checking access.
export async function getConversationReplySuggestions(id: string, auth: AuthUser, trigger: AiSuggestionTrigger = "manual"): Promise<AiSuggestionsResponse> {
  const conversation = await ConversationModel.findOne({ _id: id, ...conversationAccessFilter(auth) }).lean();
  if (!conversation) throw new AppError(404, "CONVERSATION_NOT_FOUND", "Conversation was not found");

  const aiSettings = await getAiSettings(auth.id);
  if (!aiSettings.enabled || !aiSettings.suggestionsEnabled || !shouldGenerateSuggestions(aiSettings.suggestionMode, trigger)) {
    return { suggestions: [], source: "fallback" };
  }

  const recentMessages = await MessageModel.find({ conversationId: id })
    .sort({ createdAt: -1, _id: -1 })
    .limit(REPLY_SUGGESTION_CONTEXT_SIZE)
    .lean();
  const conversationContext = recentMessages
    .reverse()
    .map((message) => {
      const content = typeof message.content === "string" ? message.content.trim() : "";
      if (!content) return null;
      const senderLabel = message.senderType === "customer"
        ? "Khách hàng"
        : message.senderType === "bot"
          ? "Trợ lý"
          : "Nhân viên";
      return `${senderLabel}: ${content}`;
    })
    .filter((message): message is string => Boolean(message));
  if (!conversationContext.some((message) => message.startsWith("Khách hàng:"))) {
    return { suggestions: [], source: "fallback" };
  }

  try {
    const { GeminiReplySuggestionProvider } = await import("../ai/reply-suggestion.provider.js");
    const suggestions = await new GeminiReplySuggestionProvider().suggest({
      conversationContext: conversationContext.join("\n"),
      modelTier: aiSettings.modelTier
    });
    return { suggestions: suggestions.slice(0, 3), source: "gemini" };
  } catch (error) {
    // Provider and configuration failures stay internal while preserving an empty fallback response.
    console.error("Gemini reply suggestion failed", {
      conversationId: id,
      ownerId: auth.id,
      trigger,
      error: describeExternalError(error)
    });
    return { suggestions: [], source: "fallback" };
  }
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
    botEnabled: row.botEnabled !== false, unreadCount: row.unreadCount, status: row.status,
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
