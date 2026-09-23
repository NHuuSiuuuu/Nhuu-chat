import mongoose, { model, Schema, type InferSchemaType } from "mongoose";

const passwordResetTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date, default: Date.now, required: true }
  },
  { versionKey: false }
);

passwordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type PasswordResetToken = InferSchemaType<typeof passwordResetTokenSchema>;

export const PasswordResetTokenModel =
  mongoose.models.PasswordResetToken ?? model<PasswordResetToken>("PasswordResetToken", passwordResetTokenSchema);
