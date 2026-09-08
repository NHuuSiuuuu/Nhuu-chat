import mongoose, { model, Schema, type InferSchemaType } from "mongoose";

const conversationSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    platform: {
      type: String,
      enum: ["facebook", "instagram", "zalo", "telegram"],
      required: true
    },
    channelId: { type: String, required: true },
    assignedAgentId: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    unreadCount: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ["open", "pending", "closed"], default: "open", index: true },
    botPausedUntil: { type: Date, default: null },
    lastMessageAt: { type: Date, default: Date.now, index: true },
    lastMessageSnippet: { type: String, default: "" }
  },
  { timestamps: true }
);

export type Conversation = InferSchemaType<typeof conversationSchema>;
conversationSchema.index({ platform: 1, channelId: 1 }, { unique: true });
export const ConversationModel =
  mongoose.models.Conversation ?? model<Conversation>("Conversation", conversationSchema);
