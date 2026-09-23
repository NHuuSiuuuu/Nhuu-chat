import type { Request, RequestHandler } from "express";

import { chatEvents, type ConversationPinEventPayload } from "@nhuu-chat/contracts";

import type { AuthenticatedRequest } from "../auth/auth.middleware.js";
import { AppError } from "../common/errors.js";
import { emitChatEvent } from "../realtime/socket.js";
import { conversationPinMessageIdSchema, conversationPinMessageSchema } from "../schemas/conversation-pin.schemas.js";
import { conversationIdSchema } from "../schemas/conversation.schemas.js";
import {
  listConversationPins as listPins,
  pinConversationMessage as pinMessage,
  unpinConversationMessage as unpinMessage
} from "../services/conversation-pin.service.js";

function authenticatedUser(request: Request) {
  const auth = (request as AuthenticatedRequest).auth;
  if (!auth) {
    throw new AppError(401, "AUTHENTICATION_REQUIRED", "Authentication is required");
  }
  return { ...auth, workspace: (request as AuthenticatedRequest).workspace };
}

function parsedConversationId(request: Request): string {
  const result = conversationIdSchema.safeParse({ id: request.params.conversationId });
  if (!result.success) {
    throw new AppError(400, "INVALID_REQUEST", "Conversation id is required");
  }
  return result.data.id;
}

function pinPayload(
  conversationId: string,
  result: { pinnedMessages: ConversationPinEventPayload["pinnedMessages"] }
): ConversationPinEventPayload {
  return { conversationId, pinnedMessages: result.pinnedMessages };
}

export const listConversationPins: RequestHandler = async (request, response, next) => {
  try {
    const conversationId = parsedConversationId(request);
    const result = await listPins(conversationId, authenticatedUser(request));
    response.json(pinPayload(conversationId, result));
  } catch (error) {
    next(error);
  }
};

export const pinConversationMessage: RequestHandler = async (request, response, next) => {
  try {
    const conversationId = parsedConversationId(request);
    const body = conversationPinMessageSchema.safeParse(request.body);
    if (!body.success) {
      throw new AppError(400, "INVALID_REQUEST", "Message id is required");
    }
    const result = await pinMessage(conversationId, body.data.messageId, authenticatedUser(request));
    const payload = pinPayload(conversationId, result);
    emitChatEvent(chatEvents.messagePinUpdated, conversationId, payload);
    response.status(201).json(payload);
  } catch (error) {
    next(error);
  }
};

export const unpinConversationMessage: RequestHandler = async (request, response, next) => {
  try {
    const conversationId = parsedConversationId(request);
    const params = conversationPinMessageIdSchema.safeParse({ messageId: request.params.messageId });
    if (!params.success) {
      throw new AppError(400, "INVALID_REQUEST", "Message id is required");
    }
    const result = await unpinMessage(conversationId, params.data.messageId, authenticatedUser(request));
    const payload = pinPayload(conversationId, result);
    emitChatEvent(chatEvents.messagePinUpdated, conversationId, payload);
    response.json(payload);
  } catch (error) {
    next(error);
  }
};
