import mongoose, { model, Schema, type InferSchemaType } from "mongoose";

function normalizeExternalMessageId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

const attachmentSchema = new Schema(
  {
    url: { type: String, required: true },
    fileType: { type: String, required: true },
    fileName: { type: String }
  },
  { _id: false }
);

const messageSchema = new Schema(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true
    },
    platform: {
      type: String,
      enum: ["facebook", "instagram", "zalo", "telegram", "telegram_personal", "zalo_personal"],
      required: true
    },
    externalMessageId: { type: String, set: normalizeExternalMessageId },
    senderType: { type: String, enum: ["customer", "agent", "bot"], required: true },
    senderId: { type: String, required: true },
    type: {
      type: String,
      enum: ["text", "image", "video", "audio", "file", "template"],
      default: "text"
    },
    content: { type: String, default: "" },
    attachments: { type: [attachmentSchema], default: [] },
    deliveryStatus: {
      type: String,
      enum: ["pending", "sent", "delivered", "failed"],
      default: "pending"
    },
    metadata: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

messageSchema.index(
  { platform: 1, externalMessageId: 1 },
  {
    unique: true,
    partialFilterExpression: { externalMessageId: { $type: "string" } }
  }
);

export type Message = InferSchemaType<typeof messageSchema>;
export const MessageModel = mongoose.models.Message ?? model<Message>("Message", messageSchema);
