import { Router } from "express";
import { AppError } from "../common/errors.js";
import { requireRole } from "../auth/auth.middleware.js";
import { listConversations, updateAssignment, updateStatus } from "./conversation.service.js";
import { listMessages } from "../messages/message.service.js";

export const conversationRouter = Router();
conversationRouter.use(requireRole("admin", "agent"));

conversationRouter.get("/", async (req, res, next) => {
  try { res.json(await listConversations(req.query as Record<string, string>)); } catch (e) { next(e); }
});
conversationRouter.get("/:id/messages", async (req, res, next) => {
  try { res.json(await listMessages(req.params.id, req.query as Record<string, string>)); } catch (e) { next(e); }
});
conversationRouter.patch("/:id/assignment", async (req, res, next) => {
  try {
    const assignedAgentId = req.body?.assignedAgentId;
    if (assignedAgentId !== null && typeof assignedAgentId !== "string") throw new AppError(400, "INVALID_REQUEST", "assignedAgentId is invalid");
    res.json(await updateAssignment(req.params.id, assignedAgentId));
  } catch (e) { next(e); }
});
conversationRouter.patch("/:id/status", async (req, res, next) => {
  try {
    if (!["open", "pending", "closed"].includes(req.body?.status)) throw new AppError(400, "INVALID_REQUEST", "status is invalid");
    res.json(await updateStatus(req.params.id, req.body.status));
  } catch (e) { next(e); }
});
