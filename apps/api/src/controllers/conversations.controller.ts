import type { Request, RequestHandler } from "express";
import { chatEvents } from "@nhuu-chat/contracts";

import type { AuthenticatedRequest } from "../auth/auth.middleware.js";
import { AppError } from "../common/errors.js";
import { ConversationModel } from "../models/conversation.model.js";
import { emitChatEvent, emitInboxEventToRecipients } from "../realtime/socket.js";
import { conversationAccessFilter } from "../realtime/access.js";
import {
  conversationAssignmentSchema,
  conversationBotSchema,
  conversationIdSchema,
  conversationListQuerySchema,
  conversationStatusSchema,
  conversationTagsSchema,
  aiSuggestionRequestSchema,
  conversationBulkActionSchema
} from "../schemas/conversation.schemas.js";
import {
  listConversations as listConversationRecords,
  bulkConversationActions as bulkConversationActionsRecord,
  markConversationRead as markConversationReadRecord,
  updateAssignment as updateConversationAssignment,
  updateBotEnabled as updateConversationBotEnabled,
  updateStatus as updateConversationStatus,
  updateConversationTags as updateConversationTagsRecord,
  getConversationReplySuggestions as getConversationReplySuggestionsRecord
} from "../services/conversation.service.js";

function authenticatedRequest(request: Request) {
  const auth = (request as AuthenticatedRequest).auth;
  if (!auth) {
    throw new AppError(401, "AUTHENTICATION_REQUIRED", "Authentication is required");
  }
  return { ...auth, workspace: (request as AuthenticatedRequest).workspace };
}

function conversationId(params: unknown): string {
  const result = conversationIdSchema.safeParse(params);
  if (!result.success) {
    throw new AppError(400, "INVALID_REQUEST", "Conversation id is required");
  }
  return result.data.id;
}

async function assertConversationAccess(id: string, auth: ReturnType<typeof authenticatedRequest>) {
  if (!(await ConversationModel.exists({ _id: id, ...conversationAccessFilter(auth) }))) {
    throw new AppError(404, "CONVERSATION_NOT_FOUND", "Conversation was not found");
  }
}

export const listConversations: RequestHandler = async (request, response, next) => {
  try {
    const auth = authenticatedRequest(request);
    const query = conversationListQuerySchema.safeParse(request.query);
    if (!query.success) {
      throw new AppError(400, "INVALID_PAGINATION", "page and limit must be positive integers");
    }
    response.json(await listConversationRecords(query.data, auth));
  } catch (error) {
    next(error);
  }
};

export const markConversationRead: RequestHandler = async (request, response, next) => {
  try {
    const auth = authenticatedRequest(request);
    const id = conversationId(request.params);
    const target = await ConversationModel.findById(id).lean();
    const result = await markConversationReadRecord(id, auth);
    emitInboxEventToRecipients(
      "chat:conversation_updated",
      [
        target?.ownerId ? String(target.ownerId) : "",
        target?.assignedAgentId ? String(target.assignedAgentId) : ""
      ],
      result
    );
    response.json(result);
  } catch (error) {
    next(error);
  }
};

export const bulkConversationActions: RequestHandler = async (request, response, next) => {
  try {
    const auth = authenticatedRequest(request);
    const body = conversationBulkActionSchema.safeParse(request.body);
    if (!body.success) throw new AppError(400, "INVALID_REQUEST", "Bulk conversation action is invalid");
    const result = await bulkConversationActionsRecord(body.data.conversationIds, body.data.action, auth);
    for (const conversation of result.conversations) {
      if (result.action === "delete") {
        const deleted = conversation as { id: string; platform: string; ownerId: string; channelId: string; assignedAgentId: string | null };
        emitInboxEventToRecipients(chatEvents.conversationDeleted, [deleted.ownerId, deleted.assignedAgentId ?? ""], deleted);
      } else {
        const updated = conversation as { id: string; assignedAgentId: string | null };
        const original = await ConversationModel.findById(updated.id).select("ownerId assignedAgentId").lean();
        emitInboxEventToRecipients("chat:conversation_updated", [original?.ownerId ? String(original.ownerId) : "", original?.assignedAgentId ? String(original.assignedAgentId) : ""], conversation);
      }
    }
    response.json(result);
  } catch (error) {
    next(error);
  }
};

export const updateAssignment: RequestHandler = async (request, response, next) => {
  try {
    const auth = authenticatedRequest(request);
    const id = conversationId(request.params);
    await assertConversationAccess(id, auth);
    const body = conversationAssignmentSchema.safeParse(request.body);
    if (!body.success) {
      throw new AppError(400, "INVALID_REQUEST", "assignedAgentId is invalid");
    }
    const result = await updateConversationAssignment(id, body.data.assignedAgentId, auth.workspace?.id);
    emitChatEvent("chat:conversation_updated", id, result);
    response.json(result);
  } catch (error) {
    next(error);
  }
};

export const updateBotEnabled: RequestHandler = async (request, response, next) => {
  try {
    const auth = authenticatedRequest(request);
    const id = conversationIdSchema.parse({ id: request.params.id }).id;
    await assertConversationAccess(id, auth);
    const body = conversationBotSchema.parse(request.body);
    const result = await updateConversationBotEnabled(id, body.botEnabled);
    emitChatEvent("chat:conversation_updated", id, result);
    response.json(result);
  } catch (error) {
    next(error);
  }
};

export const updateStatus: RequestHandler = async (request, response, next) => {
  try {
    const auth = authenticatedRequest(request);
    const id = conversationId(request.params);
    await assertConversationAccess(id, auth);
    const body = conversationStatusSchema.safeParse(request.body);
    if (!body.success) {
      throw new AppError(400, "INVALID_REQUEST", "status is invalid");
    }
    const result = await updateConversationStatus(id, body.data.status);
    emitChatEvent("chat:conversation_updated", id, result);
    response.json(result);
  } catch (error) {
    next(error);
  }
};

export const updateConversationTags: RequestHandler = async (request, response, next) => {
  try {
    const auth = authenticatedRequest(request);
    const id = conversationId(request.params);
    const body = conversationTagsSchema.safeParse(request.body);
    if (!body.success) throw new AppError(400, "INVALID_REQUEST", "tagIds is invalid");
    const target = await ConversationModel.findById(id).lean();
    const result = await updateConversationTagsRecord(id, body.data.tagIds, auth);
    emitInboxEventToRecipients(
      "chat:conversation_updated",
      [target?.ownerId ? String(target.ownerId) : "", target?.assignedAgentId ? String(target.assignedAgentId) : ""],
      result
    );
    response.json(result);
  } catch (error) {
    next(error);
  }
};

export const getConversationReplySuggestions: RequestHandler = async (request, response, next) => {
  try {
    const auth = authenticatedRequest(request);
    const id = conversationId(request.params);
    const body = aiSuggestionRequestSchema.safeParse(request.body ?? {});
    if (!body.success) throw new AppError(400, "INVALID_REQUEST", "Suggestion trigger is invalid");
    response.json(await getConversationReplySuggestionsRecord(id, auth, body.data.trigger));
  } catch (error) {
    next(error);
  }
};
