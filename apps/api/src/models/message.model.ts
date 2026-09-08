import { model, models, Schema, type InferSchemaType } from "mongoose";

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
      enum: ["facebook", "instagram", "zalo", "telegram"],
      required: true
    },
    externalMessageId: { type: String },
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
export const MessageModel = models.Message ?? model<Message>("Message", messageSchema);
