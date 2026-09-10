import { Router } from "express";

import { requireRole } from "../auth/auth.middleware.js";
import { inboxAccessRoles } from "../auth/inbox-access.js";
import {
  listConversations,
  markConversationRead,
  updateAssignment,
  updateStatus,
  updateConversationTags
} from "../controllers/conversations.controller.js";
import { listMessages } from "../controllers/messages.controller.js";

export const conversationRouter = Router();

conversationRouter.get("/", requireRole(...inboxAccessRoles), listConversations);
conversationRouter.get("/:id/messages", requireRole(...inboxAccessRoles), listMessages);
conversationRouter.patch("/:id/read", requireRole(...inboxAccessRoles), markConversationRead);
conversationRouter.patch("/:id/assignment", requireRole("admin", "agent"), updateAssignment);
conversationRouter.patch("/:id/status", requireRole("admin", "agent"), updateStatus);
conversationRouter.put("/:id/tags", requireRole("admin", "agent"), updateConversationTags);
