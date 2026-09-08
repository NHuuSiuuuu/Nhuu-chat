import { Router } from "express";
import { AppError } from "../common/errors.js";
import { requireRole } from "../auth/auth.middleware.js";
import { ConversationModel } from "../models/conversation.model.js";
import { createOutboundMessage, toMessage } from "./message.service.js";

export const messageRouter = Router();
messageRouter.post("/send", requireRole("admin", "agent"), async (req, res, next) => {
  try {
    const { conversationId, type, content } = req.body ?? {};
    if (typeof conversationId !== "string" || type !== "text" || typeof content !== "string") throw new AppError(400, "INVALID_REQUEST", "conversationId, type and content are required");
    const conversation = await ConversationModel.findById(conversationId).lean();
    if (!conversation) throw new AppError(404, "CONVERSATION_NOT_FOUND", "Conversation was not found");
    const message = await createOutboundMessage({ conversationId, platform: conversation.platform, senderId: "agent", content, deliveryStatus: "pending" });
    res.status(201).json(toMessage(message.toObject()));
  } catch (e) { next(e); }
});
