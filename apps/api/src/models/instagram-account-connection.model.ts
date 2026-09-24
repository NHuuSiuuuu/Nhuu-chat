import mongoose, { model, Schema, type InferSchemaType } from "mongoose";

const instagramAccountConnectionSchema = new Schema(
  {
    ownerUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    instagramUserId: { type: String, required: true, trim: true },
    username: { type: String, default: null, trim: true },
    displayName: { type: String, default: null, trim: true },
    avatarUrl: { type: String, default: null },
    encryptedAccessToken: { type: String, required: true, select: false },
    tokenExpiresAt: { type: Date, default: null },
    status: { type: String, enum: ["connected", "invalid", "disconnected"], default: "connected", required: true },
    subscribedAt: { type: Date, default: null },
    lastValidatedAt: { type: Date, default: null },
    lastErrorCode: { type: String, default: null }
  },
  { timestamps: true }
);

instagramAccountConnectionSchema.index({ instagramUserId: 1 }, { unique: true });
instagramAccountConnectionSchema.index({ ownerUserId: 1, status: 1 });

export type InstagramAccountConnection = InferSchemaType<typeof instagramAccountConnectionSchema>;
export const InstagramAccountConnectionModel =
  mongoose.models.InstagramAccountConnection ??
  model<InstagramAccountConnection>("InstagramAccountConnection", instagramAccountConnectionSchema);
