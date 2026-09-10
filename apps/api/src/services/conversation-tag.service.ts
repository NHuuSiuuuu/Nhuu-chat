import { AppError } from "../common/errors.js";
import { ConversationTagModel } from "../models/conversation-tag.model.js";

export interface ConversationTagInput {
  name: string;
  color: string;
}

export interface ConversationTagUpdate {
  name?: string;
  color?: string;
}

function nameKey(name: string): string {
  return name.trim().toLocaleLowerCase("vi");
}

function toConversationTag(row: { _id: unknown; name: string; color: string }) {
  return { id: String(row._id), name: row.name, color: row.color };
}

export async function listConversationTags() {
  const rows = await ConversationTagModel.find({}).sort({ createdAt: 1, _id: 1 }).lean();
  return { tags: rows.map(toConversationTag) };
}

export async function createConversationTag(input: ConversationTagInput) {
  const name = input.name.trim();
  const row = await ConversationTagModel.create({ name, nameKey: nameKey(name), color: input.color.toLowerCase() });
  return toConversationTag(row);
}

export async function updateConversationTag(id: string, input: ConversationTagUpdate) {
  const set: Record<string, string> = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    set.name = name;
    set.nameKey = nameKey(name);
  }
  if (input.color !== undefined) set.color = input.color.toLowerCase();

  const row = await ConversationTagModel.findByIdAndUpdate(
    id,
    { $set: set },
    { new: true, runValidators: true }
  ).lean();
  if (!row) throw new AppError(404, "CONVERSATION_TAG_NOT_FOUND", "Conversation tag was not found");
  return toConversationTag(row);
}

export async function deleteConversationTag(id: string) {
  const row = await ConversationTagModel.findByIdAndDelete(id).lean();
  if (!row) throw new AppError(404, "CONVERSATION_TAG_NOT_FOUND", "Conversation tag was not found");
}
