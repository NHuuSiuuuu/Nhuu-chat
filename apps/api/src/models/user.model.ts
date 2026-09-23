import mongoose, { model, Schema, type InferSchemaType } from "mongoose";

import {
  DEFAULT_GENERAL_SETTINGS,
  notificationSounds
} from "../general-settings/general-settings.js";

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

const generalSettingsSchema = new Schema(
  {
    browserNotificationsEnabled: { type: Boolean, default: DEFAULT_GENERAL_SETTINGS.browserNotificationsEnabled },
    notificationSound: { type: String, enum: notificationSounds, default: DEFAULT_GENERAL_SETTINGS.notificationSound },
    moveUnreadConversationsToTop: { type: Boolean, default: DEFAULT_GENERAL_SETTINGS.moveUnreadConversationsToTop },
    openNextUnreadConversation: { type: Boolean, default: DEFAULT_GENERAL_SETTINGS.openNextUnreadConversation }
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
    authSessionRevision: { type: Number, default: 0, select: false },
    aiSettings: { type: aiSettingsSchema, default: () => ({}) },
    generalSettings: { type: generalSettingsSchema, default: () => ({}) }
  },
  { timestamps: true }
);

userSchema.set("toJSON", {
  transform: (_document, result) => {
    const safeResult = result as Record<string, unknown>;
    delete safeResult.passwordHash;
    delete safeResult.refreshTokenHash;
    delete safeResult.authSessionRevision;
    return result;
  }
});

export type User = InferSchemaType<typeof userSchema>;

export const UserModel = mongoose.models.User ?? model<User>("User", userSchema);
