import mongoose, { model, Schema, type InferSchemaType } from "mongoose";

const zaloPersonalSessionSchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    encryptedCredentials: { type: String, required: true, select: false },
    zaloUserId: { type: String, required: true },
    displayName: { type: String, default: null },
    username: { type: String, default: null },
    status: { type: String, enum: ["disconnected", "waiting_qr", "connected", "expired", "error"], default: "disconnected", index: true },
    qrSessionId: { type: String, default: null },
    qrExpiresAt: { type: Date, default: null },
    connectedAt: { type: Date, default: null },
    lastSeenAt: { type: Date, default: null },
    lastErrorCode: { type: String, default: null }
  },
  { timestamps: true }
);

export type ZaloPersonalSession = InferSchemaType<typeof zaloPersonalSessionSchema>;
export const ZaloPersonalSessionModel =
  mongoose.models.ZaloPersonalSession ??
  model<ZaloPersonalSession>("ZaloPersonalSession", zaloPersonalSessionSchema);
