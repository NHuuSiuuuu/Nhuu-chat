import { Router } from "express";

import { requireRole } from "../auth/auth.middleware.js";
import { inboxAccessRoles } from "../auth/inbox-access.js";
import {
  listConversations,
  markConversationRead,
  updateAssignment,
  updateBotEnabled,
  updateStatus,
  updateConversationTags,
  getConversationReplySuggestions
} from "../controllers/conversations.controller.js";
import { listMessages } from "../controllers/messages.controller.js";
import { createConversationNote, deleteConversationNote, listConversationNotes, toggleConversationNotePin, updateConversationNote } from "../controllers/conversation-notes.controller.js";
import { listConversationPins, pinConversationMessage, unpinConversationMessage } from "../controllers/conversation-pins.controller.js";

export const conversationRouter = Router();

conversationRouter.get("/", requireRole(...inboxAccessRoles), listConversations);
conversationRouter.get("/:id/messages", requireRole(...inboxAccessRoles), listMessages);
conversationRouter.get("/:conversationId/pins", requireRole("admin", "agent"), listConversationPins);
conversationRouter.post("/:conversationId/pins", requireRole("admin", "agent"), pinConversationMessage);
conversationRouter.delete("/:conversationId/pins/:messageId", requireRole("admin", "agent"), unpinConversationMessage);
conversationRouter.get("/:conversationId/notes", requireRole("admin", "agent"), listConversationNotes);
conversationRouter.post("/:conversationId/notes", requireRole("admin", "agent"), createConversationNote);
conversationRouter.patch("/:conversationId/notes/:noteId", requireRole("admin", "agent"), updateConversationNote);
conversationRouter.delete("/:conversationId/notes/:noteId", requireRole("admin", "agent"), deleteConversationNote);
conversationRouter.patch("/:conversationId/notes/:noteId/pin", requireRole("admin", "agent"), toggleConversationNotePin);
conversationRouter.patch("/:id/read", requireRole(...inboxAccessRoles), markConversationRead);
conversationRouter.patch("/:id/assignment", requireRole("admin", "agent"), updateAssignment);
conversationRouter.patch("/:id/bot", requireRole("admin", "agent"), updateBotEnabled);
conversationRouter.patch("/:id/status", requireRole("admin", "agent"), updateStatus);
conversationRouter.put("/:id/tags", requireRole("admin", "agent"), updateConversationTags);
conversationRouter.post("/:id/ai-suggestions", requireRole("admin", "agent"), getConversationReplySuggestions);
