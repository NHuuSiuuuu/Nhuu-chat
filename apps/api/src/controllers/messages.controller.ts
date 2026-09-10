import type { Request, RequestHandler } from "express";

import type { AuthenticatedRequest } from "../auth/auth.middleware.js";
import { getActivePersonalClient } from "../channels/telegram-personal/telegram-personal.service.js";
import { TelegramClient } from "../channels/telegram/telegram.client.js";
import { AppError } from "../common/errors.js";
import { ConversationModel } from "../models/conversation.model.js";
import { canJoinConversation } from "../realtime/access.js";
import { emitChatEvent, emitInboxEventToRecipients } from "../realtime/socket.js";
import { conversationIdSchema } from "../schemas/conversation.schemas.js";
import { messageListQuerySchema, outboundMessageSchema } from "../schemas/message.schemas.js";
import { toConversation } from "../services/conversation.service.js";
import {
  createOutboundMessage,
  listMessages as listMessageRecords,
  toMessage
} from "../services/message.service.js";
import { readProviderSecretByName } from "../services/provider-secret.service.js";

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
    const accessFilter = auth.role === "admin"
      ? {}
      : auth.role === "agent"
        ? { assignedAgentId: auth.id }
        : { ownerId: auth.id };
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
      throw new AppError(400, "INVALID_REQUEST", "conversationId, type and content are required");
    }
    const { conversationId, content } = body.data;
    const conversation = await ConversationModel.findById(conversationId)
      .populate("customerId", "name avatarUrl")
      .lean();
    if (!conversation) {
      throw new AppError(404, "CONVERSATION_NOT_FOUND", "Conversation was not found");
    }
    const auth = (request as AuthenticatedRequest).auth;
    if (!auth || !canJoinConversation(auth, conversation)) {
      throw new AppError(403, "FORBIDDEN", "You do not have access to this conversation");
    }

    let deliveryStatus: "pending" | "sent" | "failed" = "sent";
    let externalMessageId: string | undefined;
    if (conversation.platform === "telegram_personal") {
      const userId = auth.id;
      if (!userId || String(conversation.ownerId) !== userId) {
        throw new AppError(403, "FORBIDDEN", "You do not own this Telegram connection");
      }
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
    const result = toMessage(message.toObject());
    emitChatEvent("chat:message_received", conversationId, result);
    emitChatEvent("chat:delivery_updated", conversationId, result);
    emitInboxEventToRecipients(
      "chat:conversation_updated",
      [
        conversation.ownerId ? String(conversation.ownerId) : "",
        conversation.assignedAgentId ? String(conversation.assignedAgentId) : ""
      ],
      toConversation({ ...conversation, lastMessageAt: new Date(), lastMessageSnippet: content })
    );
    response.status(201).json(result);
  } catch (error) {
    next(error);
  }
};
