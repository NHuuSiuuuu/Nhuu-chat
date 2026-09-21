import mongoose, { model, Schema, type InferSchemaType } from "mongoose";

const facebookPostMediaSchema = new Schema(
  {
    secureUrl: { type: String, required: true },
    publicId: { type: String, required: true },
    resourceType: { type: String, enum: ["image"], required: true },
    mimeType: { type: String, required: true },
    bytes: { type: Number, required: true },
    width: { type: Number, default: null },
    height: { type: Number, default: null }
  },
  { _id: false }
);

const facebookPostSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    connectionId: { type: Schema.Types.ObjectId, ref: "FacebookPageConnection", required: true },
    pageId: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    media: { type: facebookPostMediaSchema, default: null },
    status: {
      type: String,
      enum: ["draft", "scheduled", "publishing", "published", "failed"],
      default: "draft",
      required: true
    },
    scheduledAt: { type: Date, default: null },
    timezone: { type: String, enum: ["Asia/Ho_Chi_Minh"], default: "Asia/Ho_Chi_Minh", required: true },
    publishedPostId: { type: String, default: null },
    attempts: { type: Number, default: 0, min: 0, required: true },
    lastErrorCode: { type: String, default: null },
    lastErrorMessage: { type: String, default: null },
    publishingLeaseUntil: { type: Date, default: null },
    publishedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

facebookPostSchema.index({ status: 1, scheduledAt: 1 });
facebookPostSchema.index({ status: 1, publishingLeaseUntil: 1 });

export type FacebookPost = InferSchemaType<typeof facebookPostSchema>;
export const FacebookPostModel =
  mongoose.models.FacebookPost ?? model<FacebookPost>("FacebookPost", facebookPostSchema);
