import { Router } from "express";
import { AppError } from "../common/errors.js";
import { requireRole } from "../auth/auth.middleware.js";
import { listConversations, updateAssignment, updateStatus } from "./conversation.service.js";
import { listMessages } from "../messages/message.service.js";
import { ConversationModel } from "../models/conversation.model.js";
import { emitChatEvent } from "../realtime/socket.js";

export const conversationRouter = Router();
conversationRouter.use(requireRole("admin", "agent"));

conversationRouter.get("/", async (req, res, next) => {
  try {
    const query = req.query as Record<string, unknown>;
    const scalar = (value: unknown) => typeof value === "string" ? value : undefined;
    res.json(await listConversations({ page: scalar(query.page), limit: scalar(query.limit), platform: scalar(query.platform), status: scalar(query.status) }));
  } catch (e) { next(e); }
});
conversationRouter.get("/:id/messages", async (req, res, next) => {
  try {
    if (!(await ConversationModel.exists({ _id: req.params.id }))) throw new AppError(404, "CONVERSATION_NOT_FOUND", "Conversation was not found");
    const query = req.query as Record<string, unknown>;
    res.json(await listMessages(req.params.id, { page: typeof query.page === "string" ? query.page : undefined, limit: typeof query.limit === "string" ? query.limit : undefined }));
  } catch (e) { next(e); }
});
conversationRouter.patch("/:id/assignment", async (req, res, next) => {
  try {
    const assignedAgentId = req.body?.assignedAgentId;
    if (assignedAgentId !== null && typeof assignedAgentId !== "string") throw new AppError(400, "INVALID_REQUEST", "assignedAgentId is invalid");
    const result = await updateAssignment(req.params.id, assignedAgentId);
    emitChatEvent("chat:conversation_updated", req.params.id, result);
    res.json(result);
  } catch (e) { next(e); }
});
conversationRouter.patch("/:id/status", async (req, res, next) => {
  try {
    if (!["open", "pending", "closed"].includes(req.body?.status)) throw new AppError(400, "INVALID_REQUEST", "status is invalid");
    const result = await updateStatus(req.params.id, req.body.status);
    emitChatEvent("chat:conversation_updated", req.params.id, result);
    res.json(result);
  } catch (e) { next(e); }
});
