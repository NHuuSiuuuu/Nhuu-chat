import type { Request, RequestHandler } from "express";

import type { AuthenticatedRequest } from "../auth/auth.middleware.js";
import { AppError } from "../common/errors.js";
import { ConversationModel } from "../models/conversation.model.js";
import { emitChatEvent, emitInboxEventToRecipients } from "../realtime/socket.js";
import {
  conversationAssignmentSchema,
  conversationIdSchema,
  conversationListQuerySchema,
  conversationStatusSchema,
  conversationTagsSchema,
  aiSuggestionRequestSchema
} from "../schemas/conversation.schemas.js";
import {
  listConversations as listConversationRecords,
  markConversationRead as markConversationReadRecord,
  updateAssignment as updateConversationAssignment,
  updateStatus as updateConversationStatus,
  updateConversationTags as updateConversationTagsRecord,
  getConversationReplySuggestions as getConversationReplySuggestionsRecord
} from "../services/conversation.service.js";

function authenticatedRequest(request: Request) {
  const auth = (request as AuthenticatedRequest).auth;
  if (!auth) {
    throw new AppError(401, "AUTHENTICATION_REQUIRED", "Authentication is required");
  }
  return auth;
}

function conversationId(params: unknown): string {
  const result = conversationIdSchema.safeParse(params);
  if (!result.success) {
    throw new AppError(400, "INVALID_REQUEST", "Conversation id is required");
  }
  return result.data.id;
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

export const updateAssignment: RequestHandler = async (request, response, next) => {
  try {
    const id = conversationId(request.params);
    const body = conversationAssignmentSchema.safeParse(request.body);
    if (!body.success) {
      throw new AppError(400, "INVALID_REQUEST", "assignedAgentId is invalid");
    }
    const result = await updateConversationAssignment(id, body.data.assignedAgentId);
    emitChatEvent("chat:conversation_updated", id, result);
    response.json(result);
  } catch (error) {
    next(error);
  }
};

export const updateStatus: RequestHandler = async (request, response, next) => {
  try {
    const id = conversationId(request.params);
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
