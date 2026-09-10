import { Router } from "express";

import { requireRole } from "../auth/auth.middleware.js";
import {
  createConversationTag,
  deleteConversationTag,
  listConversationTags,
  updateConversationTag
} from "../controllers/conversation-tags.controller.js";

export const conversationTagRouter = Router();

conversationTagRouter.use(requireRole("admin", "agent"));
conversationTagRouter.get("/", listConversationTags);
conversationTagRouter.post("/", createConversationTag);
conversationTagRouter.patch("/:id", updateConversationTag);
conversationTagRouter.delete("/:id", deleteConversationTag);
