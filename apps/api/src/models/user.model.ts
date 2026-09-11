import mongoose, { model, Schema, type InferSchemaType } from "mongoose";

const aiSettingsSchema = new Schema(
  {
    modelTier: { type: String, enum: ["smart", "balanced", "economy"], default: "smart" },
    enabled: { type: Boolean, default: true },
    suggestionsEnabled: { type: Boolean, default: true },
    sentimentEnabled: { type: Boolean, default: true },
    suggestionMode: { type: String, enum: ["off", "manual", "on_open", "on_customer_message"], default: "on_open" },
    sentimentWindow: { type: Number, enum: [3, 6, 10], default: 3 }
  },
  { _id: false }
);

export const roles = ["admin", "agent", "customer"] as const;
export type Role = (typeof roles)[number];

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: roles, required: true },
    refreshTokenHash: { type: String, default: null, select: false },
    aiSettings: { type: aiSettingsSchema, default: () => ({}) }
  },
  { timestamps: true }
);

userSchema.set("toJSON", {
  transform: (_document, result) => {
    const safeResult = result as Record<string, unknown>;
    delete safeResult.passwordHash;
    delete safeResult.refreshTokenHash;
    return result;
  }
});

export type User = InferSchemaType<typeof userSchema>;

export const UserModel = mongoose.models.User ?? model<User>("User", userSchema);
