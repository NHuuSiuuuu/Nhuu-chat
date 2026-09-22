import mongoose, { model, Schema, type InferSchemaType } from "mongoose";

export const SETTING_HISTORY_ACTION_TYPES = [
  "UPDATE_AI_SETTINGS",
  "CONNECT_FACEBOOK_PAGE",
  "DISCONNECT_FACEBOOK_PAGE"
] as const;

export type SettingHistoryActionType = typeof SETTING_HISTORY_ACTION_TYPES[number];

export type SettingHistoryChange = {
  fieldName: string;
  oldValue: unknown;
  newValue: unknown;
};

const settingHistoryChangeSchema = new Schema<SettingHistoryChange>(
  {
    fieldName: { type: String, required: true },
    oldValue: { type: Schema.Types.Mixed },
    newValue: { type: Schema.Types.Mixed }
  },
  { _id: false }
);

const settingHistorySchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    actionType: {
      type: String,
      enum: SETTING_HISTORY_ACTION_TYPES,
      required: true
    },
    actionTitle: { type: String, required: true, trim: true },
    changes: { type: [settingHistoryChangeSchema], required: true },
    versionHash: { type: String, required: true, trim: true }
  },
  { timestamps: true }
);

settingHistorySchema.index({ userId: 1, createdAt: -1, _id: -1 });
settingHistorySchema.index({ userId: 1, actionType: 1, createdAt: -1, _id: -1 });

export type SettingHistory = InferSchemaType<typeof settingHistorySchema>;
export const SettingHistoryModel =
  mongoose.models.SettingHistory ?? model<SettingHistory>("SettingHistory", settingHistorySchema);
