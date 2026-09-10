import mongoose, { model, Schema, type InferSchemaType } from "mongoose";

const conversationTagSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    nameKey: { type: String, required: true, unique: true, index: true },
    color: { type: String, required: true, match: /^#[0-9a-fA-F]{6}$/ }
  },
  { timestamps: true }
);

export type ConversationTag = InferSchemaType<typeof conversationTagSchema>;
export const ConversationTagModel =
  mongoose.models.ConversationTag ?? model<ConversationTag>("ConversationTag", conversationTagSchema);
