import mongoose, { model, Schema, type InferSchemaType } from "mongoose";

const telegramPersonalSessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    encryptedSession: { type: String, required: true, select: false },
    telegramUserId: { type: String, required: true },
    username: { type: String, default: null },
    displayName: { type: String, required: true },
    status: { type: String, enum: ["active", "disconnected"], default: "active", index: true },
    connectedAt: { type: Date, required: true },
    lastSyncedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

export type TelegramPersonalSession = InferSchemaType<typeof telegramPersonalSessionSchema>;
export const TelegramPersonalSessionModel =
  mongoose.models.TelegramPersonalSession ??
  model<TelegramPersonalSession>("TelegramPersonalSession", telegramPersonalSessionSchema);
