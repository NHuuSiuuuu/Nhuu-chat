import { Router } from "express";
import { AppError } from "../common/errors.js";
import { requireRole, type AuthenticatedRequest } from "../auth/auth.middleware.js";
import { listConversations, markConversationRead, updateAssignment, updateStatus } from "./conversation.service.js";
import { listMessages } from "../messages/message.service.js";
import { ConversationModel } from "../models/conversation.model.js";
import { emitChatEvent } from "../realtime/socket.js";
import { inboxAccessRoles } from "../auth/inbox-access.js";
import { emitInboxEventToRecipients } from "../realtime/socket.js";

export const conversationRouter = Router();

function conversationIdParam(value: string | string[]): string {
  const id = Array.isArray(value) ? value[0] : value;
  if (!id) throw new AppError(400, "INVALID_REQUEST", "Conversation id is required");
  return id;
}

conversationRouter.get("/", requireRole(...inboxAccessRoles), async (req, res, next) => {
  try {
    const auth = (req as AuthenticatedRequest).auth;
    if (!auth) throw new AppError(401, "AUTHENTICATION_REQUIRED", "Authentication is required");
    const query = req.query as Record<string, unknown>;
    const scalar = (value: unknown) => typeof value === "string" ? value : undefined;
    res.json(await listConversations({ page: scalar(query.page), limit: scalar(query.limit), platform: scalar(query.platform), status: scalar(query.status) }, auth));
  } catch (e) { next(e); }
});
conversationRouter.get("/:id/messages", requireRole(...inboxAccessRoles), async (req, res, next) => {
  try {
    const conversationId = conversationIdParam(req.params.id);
    const auth = (req as AuthenticatedRequest).auth;
    if (!auth) throw new AppError(401, "AUTHENTICATION_REQUIRED", "Authentication is required");
    const accessFilter = auth.role === "admin" ? {} : auth.role === "agent" ? { assignedAgentId: auth.id } : { ownerId: auth.id };
    if (!(await ConversationModel.exists({ _id: conversationId, ...accessFilter }))) throw new AppError(404, "CONVERSATION_NOT_FOUND", "Conversation was not found");
    const query = req.query as Record<string, unknown>;
    res.json(await listMessages(conversationId, { page: typeof query.page === "string" ? query.page : undefined, limit: typeof query.limit === "string" ? query.limit : undefined }));
  } catch (e) { next(e); }
});
conversationRouter.patch("/:id/read", requireRole(...inboxAccessRoles), async (req, res, next) => {
  try {
    const auth = (req as AuthenticatedRequest).auth;
    if (!auth) throw new AppError(401, "AUTHENTICATION_REQUIRED", "Authentication is required");
    const conversationId = conversationIdParam(req.params.id);
    const target = await ConversationModel.findById(conversationId).lean();
    const result = await markConversationRead(conversationId, auth);
    emitInboxEventToRecipients("chat:conversation_updated", [target?.ownerId ? String(target.ownerId) : "", target?.assignedAgentId ? String(target.assignedAgentId) : ""], result);
    res.json(result);
  } catch (e) { next(e); }
});
conversationRouter.patch("/:id/assignment", requireRole("admin", "agent"), async (req, res, next) => {
  try {
    const conversationId = conversationIdParam(req.params.id);
    const assignedAgentId = req.body?.assignedAgentId;
    if (assignedAgentId !== null && typeof assignedAgentId !== "string") throw new AppError(400, "INVALID_REQUEST", "assignedAgentId is invalid");
    const result = await updateAssignment(conversationId, assignedAgentId);
    emitChatEvent("chat:conversation_updated", conversationId, result);
    res.json(result);
  } catch (e) { next(e); }
});
conversationRouter.patch("/:id/status", requireRole("admin", "agent"), async (req, res, next) => {
  try {
    const conversationId = conversationIdParam(req.params.id);
    if (!["open", "pending", "closed"].includes(req.body?.status)) throw new AppError(400, "INVALID_REQUEST", "status is invalid");
    const result = await updateStatus(conversationId, req.body.status);
    emitChatEvent("chat:conversation_updated", conversationId, result);
    res.json(result);
  } catch (e) { next(e); }
});
