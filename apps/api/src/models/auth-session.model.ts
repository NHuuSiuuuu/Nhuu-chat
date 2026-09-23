import mongoose, { model, Schema, type InferSchemaType } from "mongoose";

const authSessionSchema = new Schema(
  {
    sessionId: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    refreshTokenHash: { type: String, required: true, select: false },
    lastUsedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true }
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);

authSessionSchema.index({ userId: 1 });
authSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type AuthSession = InferSchemaType<typeof authSessionSchema>;

export const AuthSessionModel =
  mongoose.models.AuthSession ?? model<AuthSession>("AuthSession", authSessionSchema);
