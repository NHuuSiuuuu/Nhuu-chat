import type { Request, RequestHandler } from "express";
import { AppError } from "../common/errors.js";
import type { AuthenticatedRequest } from "../auth/auth.middleware.js";
import { conversationNoteContentSchema, conversationNotePinSchema } from "../schemas/conversation-note.schemas.js";
import { createConversationNote as createNote, deleteConversationNote as deleteNote, listConversationNotes as listNotes, toggleConversationNotePin as togglePin, updateConversationNote as updateNote } from "../services/conversation-note.service.js";

function auth(request: Request) {
  const value = (request as AuthenticatedRequest).auth;
  if (!value) throw new AppError(401, "AUTHENTICATION_REQUIRED", "Authentication is required");
  return value;
}

function noteParams(request: Request) {
  const conversationId = Array.isArray(request.params.conversationId) ? request.params.conversationId[0] : request.params.conversationId;
  const noteId = Array.isArray(request.params.noteId) ? request.params.noteId[0] : request.params.noteId;
  if (!conversationId || (request.params.noteId !== undefined && !noteId)) throw new AppError(400, "INVALID_REQUEST", "Conversation and note ids are required");
  return { conversationId, noteId };
}

export const listConversationNotes: RequestHandler = async (request, response, next) => {
  try { const { conversationId } = noteParams(request); response.json(await listNotes(conversationId, auth(request))); } catch (error) { next(error); }
};
export const createConversationNote: RequestHandler = async (request, response, next) => {
  try { const { conversationId } = noteParams(request); const body = conversationNoteContentSchema.safeParse(request.body); if (!body.success) throw new AppError(400, "INVALID_REQUEST", "Note content is invalid"); response.status(201).json(await createNote(conversationId, body.data.content, auth(request))); } catch (error) { next(error); }
};
export const updateConversationNote: RequestHandler = async (request, response, next) => {
  try { const { conversationId, noteId } = noteParams(request); if (!noteId) throw new AppError(400, "INVALID_REQUEST", "Note id is required"); const body = conversationNoteContentSchema.safeParse(request.body); if (!body.success) throw new AppError(400, "INVALID_REQUEST", "Note content is invalid"); response.json(await updateNote(conversationId, noteId, body.data.content, auth(request))); } catch (error) { next(error); }
};
export const deleteConversationNote: RequestHandler = async (request, response, next) => {
  try { const { conversationId, noteId } = noteParams(request); if (!noteId) throw new AppError(400, "INVALID_REQUEST", "Note id is required"); await deleteNote(conversationId, noteId, auth(request)); response.status(204).send(); } catch (error) { next(error); }
};
export const toggleConversationNotePin: RequestHandler = async (request, response, next) => {
  try { const { conversationId, noteId } = noteParams(request); if (!noteId) throw new AppError(400, "INVALID_REQUEST", "Note id is required"); const body = conversationNotePinSchema.safeParse(request.body); if (!body.success) throw new AppError(400, "INVALID_REQUEST", "Pin state is invalid"); response.json(await togglePin(conversationId, noteId, body.data.isPinned, auth(request))); } catch (error) { next(error); }
};
