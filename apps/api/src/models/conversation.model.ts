import mongoose, { model, Schema, type InferSchemaType } from "mongoose";

const conversationSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    platform: {
      type: String,
      enum: ["facebook", "instagram", "zalo", "telegram", "telegram_personal", "zalo_personal"],
      required: true
    },
    channelId: { type: String, required: true },
    // Zalo personal conversations must stay bound to the account that received them.
    zaloAccountId: { type: String, default: null },
    conversationName: { type: String, default: null },
    conversationType: { type: String, enum: ["private", "group"], default: "private" },
    tagIds: [{ type: Schema.Types.ObjectId, ref: "ConversationTag" }],
    ownerId: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    assignedAgentId: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    unreadCount: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ["open", "pending", "closed"], default: "open", index: true },
    botEnabled: { type: Boolean, default: true, index: true },
    botPausedUntil: { type: Date, default: null },
    sendLeaseId: { type: String, default: null },
    sendLeaseAt: { type: Date, default: null },
    pinnedMessages: [{
      _id: false,
      messageId: { type: Schema.Types.ObjectId, ref: "Message", required: true },
      pinnedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
      pinnedAt: { type: Date, required: true }
    }],
    lastMessageAt: { type: Date, default: Date.now, index: true },
    lastMessageSnippet: { type: String, default: "" }
  },
  { timestamps: true }
);

export type Conversation = InferSchemaType<typeof conversationSchema>;
conversationSchema.index(
  { platform: 1, channelId: 1, ownerId: 1, customerId: 1 },
  { name: "platform_1_channelId_1_ownerId_1_customerId_1_facebook", unique: true, partialFilterExpression: { platform: "facebook" } }
);
conversationSchema.index(
  { platform: 1, channelId: 1, ownerId: 1 },
  { name: "platform_1_channelId_1_ownerId_1_other", unique: true, partialFilterExpression: { platform: { $in: ["zalo", "telegram", "telegram_personal", "zalo_personal"] } } }
);
conversationSchema.index(
  { platform: 1, channelId: 1, ownerId: 1, customerId: 1 },
  { name: "platform_1_channelId_1_ownerId_1_customerId_1_instagram", unique: true, partialFilterExpression: { platform: "instagram" } }
);
export const ConversationModel =
  mongoose.models.Conversation ?? model<Conversation>("Conversation", conversationSchema);
