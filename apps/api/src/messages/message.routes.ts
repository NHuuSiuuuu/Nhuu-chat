import { Router } from "express";
import { AppError } from "../common/errors.js";
import { requireRole } from "../auth/auth.middleware.js";
import { ConversationModel } from "../models/conversation.model.js";
import { createOutboundMessage, toMessage } from "./message.service.js";
import { readProviderSecretByName } from "../services/provider-secret.service.js";
import { TelegramClient } from "../channels/telegram/telegram.client.js";
import { emitChatEvent, emitInboxEventToRecipients } from "../realtime/socket.js";
import { toConversation } from "../conversations/conversation.service.js";
import { inboxAccessRoles } from "../auth/inbox-access.js";
import { getActivePersonalClient } from "../channels/telegram-personal/telegram-personal.service.js";
import { canJoinConversation } from "../realtime/access.js";

export const messageRouter = Router();
messageRouter.post("/send", requireRole(...inboxAccessRoles), async (req, res, next) => {
  try {
    const { conversationId, type, content } = req.body ?? {};
    if (typeof conversationId !== "string" || type !== "text" || typeof content !== "string") throw new AppError(400, "INVALID_REQUEST", "conversationId, type and content are required");
    const conversation = await ConversationModel.findById(conversationId).populate("customerId", "name avatarUrl").lean();
    if (!conversation) throw new AppError(404, "CONVERSATION_NOT_FOUND", "Conversation was not found");
    const auth = (req as import("../auth/auth.middleware.js").AuthenticatedRequest).auth;
    if (!auth || !canJoinConversation(auth, conversation)) throw new AppError(403, "FORBIDDEN", "You do not have access to this conversation");
    let deliveryStatus: "pending" | "sent" | "failed" = "sent";
    let externalMessageId: string | undefined;
    if (conversation.platform === "telegram_personal") {
      const userId = auth.id;
      if (!userId || String(conversation.ownerId) !== userId) throw new AppError(403, "FORBIDDEN", "You do not own this Telegram connection");
      const client = await getActivePersonalClient(userId);
      if (!client) throw new AppError(409, "TELEGRAM_PERSONAL_DISCONNECTED", "Telegram personal session is not active");
      const sent = await client.sendMessage(conversation.channelId, { message: content });
      externalMessageId = String(sent.id);
    } else if (conversation.platform === "telegram") {
      const botToken = await readProviderSecretByName("telegram", "bot-token");
      const delivery = await new TelegramClient(botToken).sendText(conversation.channelId, content);
      externalMessageId = delivery.externalMessageId;
    } else {
      deliveryStatus = "pending";
    }
    const message = await createOutboundMessage({ conversationId, platform: conversation.platform, senderId: "agent", content, externalMessageId, deliveryStatus });
    const result = toMessage(message.toObject());
    emitChatEvent("chat:message_received", conversationId, result);
    emitChatEvent("chat:delivery_updated", conversationId, result);
    emitInboxEventToRecipients("chat:conversation_updated", [conversation.ownerId ? String(conversation.ownerId) : "", conversation.assignedAgentId ? String(conversation.assignedAgentId) : ""], toConversation({ ...conversation, lastMessageAt: new Date(), lastMessageSnippet: content }));
    res.status(201).json(result);
  } catch (e) { next(e); }
});
