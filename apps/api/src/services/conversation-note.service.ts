import type { ConversationNoteContract } from "@nhuu-chat/contracts";
import { AppError } from "../common/errors.js";
import { conversationAccessFilter } from "../realtime/access.js";
import { ConversationModel } from "../models/conversation.model.js";
import { ConversationNoteModel } from "../models/conversation-note.model.js";
import { UserModel } from "../models/user.model.js";
import type { AuthUser } from "./auth.service.js";

type NoteRecord = {
  _id: unknown;
  conversationId: unknown;
  authorId: unknown;
  authorName: string;
  authorAvatarUrl?: string | null;
  content: string;
  isPinned?: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
};

function toNote(row: NoteRecord): ConversationNoteContract {
  return {
    id: String(row._id), conversationId: String(row.conversationId), authorId: String(row.authorId),
    authorName: row.authorName, ...(row.authorAvatarUrl ? { authorAvatarUrl: row.authorAvatarUrl } : {}),
    content: row.content, isPinned: row.isPinned === true,
    createdAt: new Date(row.createdAt).toISOString(), updatedAt: new Date(row.updatedAt).toISOString()
  };
}

async function assertConversationAccess(conversationId: string, auth: AuthUser) {
  const conversation = await ConversationModel.findOne({ _id: conversationId, ...conversationAccessFilter(auth) }).lean();
  if (!conversation) throw new AppError(404, "CONVERSATION_NOT_FOUND", "Conversation was not found");
  return conversation;
}

// Kiểm tra quyền hội thoại trước mọi thao tác để ghi chú nội bộ không bị truy cập chéo.
async function assertNoteAccess(conversationId: string, noteId: string, auth: AuthUser) {
  await assertConversationAccess(conversationId, auth);
  const note = await ConversationNoteModel.findOne({ _id: noteId, conversationId }).lean();
  if (!note) throw new AppError(404, "CONVERSATION_NOTE_NOT_FOUND", "Conversation note was not found");
  return note;
}

export async function listConversationNotes(conversationId: string, auth: AuthUser) {
  await assertConversationAccess(conversationId, auth);
  const notes = await ConversationNoteModel.find({ conversationId }).sort({ isPinned: -1, updatedAt: -1, _id: -1 }).lean();
  return { notes: notes.map(toNote) };
}

export async function createConversationNote(conversationId: string, content: string, auth: AuthUser) {
  await assertConversationAccess(conversationId, auth);
  const author = await UserModel.findById(auth.id).select("name").lean();
  if (!author) throw new AppError(401, "AUTHENTICATION_REQUIRED", "Authenticated user was not found");
  return toNote(await ConversationNoteModel.create({ conversationId, authorId: auth.id, authorName: author.name, content }));
}

export async function updateConversationNote(conversationId: string, noteId: string, content: string, auth: AuthUser) {
  await assertNoteAccess(conversationId, noteId, auth);
  const note = await ConversationNoteModel.findOneAndUpdate({ _id: noteId, conversationId }, { $set: { content } }, { new: true, runValidators: true }).lean();
  if (!note) throw new AppError(404, "CONVERSATION_NOTE_NOT_FOUND", "Conversation note was not found");
  return toNote(note);
}

export async function deleteConversationNote(conversationId: string, noteId: string, auth: AuthUser) {
  await assertNoteAccess(conversationId, noteId, auth);
  await ConversationNoteModel.findOneAndDelete({ _id: noteId, conversationId });
}

export async function toggleConversationNotePin(conversationId: string, noteId: string, isPinned: boolean, auth: AuthUser) {
  await assertNoteAccess(conversationId, noteId, auth);
  const note = await ConversationNoteModel.findOneAndUpdate({ _id: noteId, conversationId }, { $set: { isPinned } }, { new: true, runValidators: true }).lean();
  if (!note) throw new AppError(404, "CONVERSATION_NOTE_NOT_FOUND", "Conversation note was not found");
  return toNote(note);
}
