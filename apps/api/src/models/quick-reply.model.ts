import mongoose, { model, Schema, type InferSchemaType } from "mongoose";

const quickReplyAttachmentSchema = new Schema(
  {
    secureUrl: { type: String, required: true },
    publicId: { type: String, required: true },
    resourceType: { type: String, enum: ["image", "video"], required: true },
    mimeType: { type: String, required: true },
    bytes: { type: Number, required: true, min: 0 },
    width: { type: Number, min: 0 },
    height: { type: Number, min: 0 },
    duration: { type: Number, min: 0 }
  },
  { _id: false }
);

const quickReplySchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    shortcut: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    attachment: { type: quickReplyAttachmentSchema, required: false }
  },
  { timestamps: true }
);

quickReplySchema.index({ userId: 1, shortcut: 1 }, { unique: true });

export type QuickReply = InferSchemaType<typeof quickReplySchema>;
export const QuickReplyModel =
  mongoose.models.QuickReply ?? model<QuickReply>("QuickReply", quickReplySchema);
