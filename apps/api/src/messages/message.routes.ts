import { Router } from "express";
import { AppError } from "../common/errors.js";
import { requireRole } from "../auth/auth.middleware.js";
import { ConversationModel } from "../models/conversation.model.js";
import { createOutboundMessage, toMessage } from "./message.service.js";
import { readProviderSecretByName } from "../models/provider-secret.service.js";
import { TelegramClient } from "../channels/telegram/telegram.client.js";
import { emitChatEvent } from "../realtime/socket.js";

export const messageRouter = Router();
messageRouter.post("/send", requireRole("admin", "agent"), async (req, res, next) => {
  try {
    const { conversationId, type, content } = req.body ?? {};
    if (typeof conversationId !== "string" || type !== "text" || typeof content !== "string") throw new AppError(400, "INVALID_REQUEST", "conversationId, type and content are required");
    const conversation = await ConversationModel.findById(conversationId).lean();
    if (!conversation) throw new AppError(404, "CONVERSATION_NOT_FOUND", "Conversation was not found");
    let deliveryStatus: "pending" | "sent" | "failed" = "sent";
    let externalMessageId: string | undefined;
    if (conversation.platform === "telegram") {
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
    res.status(201).json(result);
  } catch (e) { next(e); }
});
