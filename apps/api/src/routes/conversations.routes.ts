import { Router } from "express";

import { requireRole } from "../auth/auth.middleware.js";
import { resolveWorkspaceContext } from "../auth/workspace.middleware.js";
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

conversationRouter.get("/", requireRole(...inboxAccessRoles), resolveWorkspaceContext, listConversations);
conversationRouter.get("/:id/messages", requireRole(...inboxAccessRoles), resolveWorkspaceContext, listMessages);
conversationRouter.get("/:conversationId/pins", requireRole(...inboxAccessRoles), resolveWorkspaceContext, listConversationPins);
conversationRouter.post("/:conversationId/pins", requireRole(...inboxAccessRoles), resolveWorkspaceContext, pinConversationMessage);
conversationRouter.delete("/:conversationId/pins/:messageId", requireRole(...inboxAccessRoles), resolveWorkspaceContext, unpinConversationMessage);
conversationRouter.get("/:conversationId/notes", requireRole(...inboxAccessRoles), resolveWorkspaceContext, listConversationNotes);
conversationRouter.post("/:conversationId/notes", requireRole(...inboxAccessRoles), resolveWorkspaceContext, createConversationNote);
conversationRouter.patch("/:conversationId/notes/:noteId", requireRole(...inboxAccessRoles), resolveWorkspaceContext, updateConversationNote);
conversationRouter.delete("/:conversationId/notes/:noteId", requireRole(...inboxAccessRoles), resolveWorkspaceContext, deleteConversationNote);
conversationRouter.patch("/:conversationId/notes/:noteId/pin", requireRole(...inboxAccessRoles), resolveWorkspaceContext, toggleConversationNotePin);
conversationRouter.patch("/:id/read", requireRole(...inboxAccessRoles), resolveWorkspaceContext, markConversationRead);
conversationRouter.patch("/:id/assignment", requireRole(...inboxAccessRoles), resolveWorkspaceContext, updateAssignment);
conversationRouter.patch("/:id/bot", requireRole(...inboxAccessRoles), resolveWorkspaceContext, updateBotEnabled);
conversationRouter.patch("/:id/status", requireRole(...inboxAccessRoles), resolveWorkspaceContext, updateStatus);
conversationRouter.put("/:id/tags", requireRole(...inboxAccessRoles), resolveWorkspaceContext, updateConversationTags);
conversationRouter.post("/:id/ai-suggestions", requireRole(...inboxAccessRoles), resolveWorkspaceContext, getConversationReplySuggestions);
