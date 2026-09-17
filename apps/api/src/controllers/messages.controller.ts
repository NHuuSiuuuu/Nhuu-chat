import type { Request, RequestHandler } from "express";

import type { AuthenticatedRequest } from "../auth/auth.middleware.js";
import { AppError } from "../common/errors.js";
import { ConversationModel } from "../models/conversation.model.js";
import { conversationAccessFilter } from "../realtime/access.js";
import { emitChatEvent, emitInboxEventToRecipients } from "../realtime/socket.js";
import { conversationIdSchema } from "../schemas/conversation.schemas.js";
import { messageListQuerySchema, outboundMessageSchema } from "../schemas/message.schemas.js";
import { listMessages as listMessageRecords, sendOutboundMessage, type UploadedOutboundFile } from "../services/message.service.js";

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

export const listMessages: RequestHandler = async (request, response, next) => {
  try {
    const id = conversationId(request.params);
    const auth = authenticatedRequest(request);
    const accessFilter = conversationAccessFilter(auth);
    if (!(await ConversationModel.exists({ _id: id, ...accessFilter }))) {
      throw new AppError(404, "CONVERSATION_NOT_FOUND", "Conversation was not found");
    }
    const query = messageListQuerySchema.safeParse(request.query);
    if (!query.success) {
      throw new AppError(400, "INVALID_PAGINATION", "page and limit must be positive integers");
    }
    response.json(await listMessageRecords(id, query.data));
  } catch (error) {
    next(error);
  }
};

export const sendMessage: RequestHandler = async (request, response, next) => {
  try {
    const body = outboundMessageSchema.safeParse(request.body);
    if (!body.success) {
      throw new AppError(400, "INVALID_REQUEST", "conversationId and type are required");
    }
    const { conversationId, content } = body.data;
    const auth = (request as AuthenticatedRequest).auth;
    const file = request.file;
    const attachment: UploadedOutboundFile | undefined = file ? {
      buffer: file.buffer,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size
    } : undefined;
    const result = await sendOutboundMessage({ conversationId, content, ...(attachment ? { attachment } : {}) }, auth);
    emitChatEvent("chat:message_received", conversationId, result.message);
    emitChatEvent("chat:delivery_updated", conversationId, result.message);
    emitInboxEventToRecipients(
      "chat:conversation_updated",
      result.recipients,
      result.conversation
    );
    response.status(201).json(result.message);
  } catch (error) {
    next(error);
  }
};
