import mongoose, { model, Schema, type InferSchemaType } from "mongoose";

const facebookPageConnectionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    platform: { type: String, enum: ["facebook"], default: "facebook", required: true },
    pageId: { type: String, required: true, trim: true },
    pageName: { type: String, default: null, trim: true },
    encryptedPageAccessToken: { type: String, required: true, select: false },
    status: { type: String, enum: ["connected", "invalid"], default: "connected", required: true },
    lastValidatedAt: { type: Date, default: null },
    lastErrorCode: { type: String, default: null }
  },
  { timestamps: true }
);

facebookPageConnectionSchema.index({ userId: 1 }, { unique: true });

export type FacebookPageConnection = InferSchemaType<typeof facebookPageConnectionSchema>;
export const FacebookPageConnectionModel =
  mongoose.models.FacebookPageConnection ??
  model<FacebookPageConnection>("FacebookPageConnection", facebookPageConnectionSchema);
