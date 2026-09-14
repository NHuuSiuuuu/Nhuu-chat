import mongoose, { model, Schema, type InferSchemaType } from "mongoose";

const conversationSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    platform: {
      type: String,
      enum: ["facebook", "instagram", "zalo", "telegram", "telegram_personal"],
      required: true
    },
    channelId: { type: String, required: true },
    conversationName: { type: String, default: null },
    conversationType: { type: String, enum: ["private", "group"], default: "private" },
    tagIds: [{ type: Schema.Types.ObjectId, ref: "ConversationTag" }],
    ownerId: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    assignedAgentId: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    unreadCount: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ["open", "pending", "closed"], default: "open", index: true },
    botPausedUntil: { type: Date, default: null },
    sendLeaseId: { type: String, default: null },
    sendLeaseAt: { type: Date, default: null },
    lastMessageAt: { type: Date, default: Date.now, index: true },
    lastMessageSnippet: { type: String, default: "" }
  },
  { timestamps: true }
);

export type Conversation = InferSchemaType<typeof conversationSchema>;
conversationSchema.index({ platform: 1, channelId: 1 }, { unique: true });
export const ConversationModel =
  mongoose.models.Conversation ?? model<Conversation>("Conversation", conversationSchema);
