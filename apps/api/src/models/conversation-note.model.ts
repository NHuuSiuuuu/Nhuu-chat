import mongoose, { model, Schema, type InferSchemaType } from "mongoose";

const conversationNoteSchema = new Schema(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: "Conversation", required: true, index: true },
    authorId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    authorName: { type: String, required: true, trim: true },
    authorAvatarUrl: { type: String, default: null },
    content: { type: String, required: true, trim: true, maxlength: 2000 },
    isPinned: { type: Boolean, default: false, index: true }
  },
  { timestamps: true }
);

conversationNoteSchema.index({ conversationId: 1, isPinned: -1, updatedAt: -1, _id: -1 });
export type ConversationNote = InferSchemaType<typeof conversationNoteSchema>;
export const ConversationNoteModel = mongoose.models.ConversationNote ?? model<ConversationNote>("ConversationNote", conversationNoteSchema);
