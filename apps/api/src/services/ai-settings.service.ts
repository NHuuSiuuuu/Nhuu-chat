import { AppError } from "../common/errors.js";
import { UserModel } from "../models/user.model.js";
import {
  aiModelTiers,
  aiSentimentWindows,
  aiSuggestionModes,
  DEFAULT_AI_SETTINGS,
  type AiModelTier,
  type AiSentimentWindow,
  type AiSettings,
  type AiSuggestionMode
} from "../ai/ai-settings.js";
import { recordSettingHistory } from "./setting-history.service.js";

export interface AiSettingsPatch {
  modelTier?: AiModelTier;
  enabled?: boolean;
  suggestionsEnabled?: boolean;
  sentimentEnabled?: boolean;
  suggestionMode?: AiSuggestionMode;
  sentimentWindow?: AiSentimentWindow;
}

function normalizeSettings(value: unknown): AiSettings {
  const settings = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const modelTier = aiModelTiers.includes(settings.modelTier as AiModelTier)
    ? settings.modelTier as AiModelTier
    : DEFAULT_AI_SETTINGS.modelTier;
  const suggestionMode = aiSuggestionModes.includes(settings.suggestionMode as AiSuggestionMode)
    ? settings.suggestionMode as AiSuggestionMode
    : DEFAULT_AI_SETTINGS.suggestionMode;
  const sentimentWindow = aiSentimentWindows.includes(settings.sentimentWindow as AiSentimentWindow)
    ? settings.sentimentWindow as AiSentimentWindow
    : DEFAULT_AI_SETTINGS.sentimentWindow;
  return {
    modelTier,
    enabled: typeof settings.enabled === "boolean" ? settings.enabled : DEFAULT_AI_SETTINGS.enabled,
    suggestionsEnabled: typeof settings.suggestionsEnabled === "boolean" ? settings.suggestionsEnabled : DEFAULT_AI_SETTINGS.suggestionsEnabled,
    sentimentEnabled: typeof settings.sentimentEnabled === "boolean" ? settings.sentimentEnabled : DEFAULT_AI_SETTINGS.sentimentEnabled,
    suggestionMode,
    sentimentWindow
  };
}

function recordSettingHistorySafely(input: Parameters<typeof recordSettingHistory>[0]): void {
  void recordSettingHistory(input).catch((error) => {
    console.error("Failed to record setting history", {
      userId: input.userId,
      actionType: input.actionType,
      error
    });
  });
}

export async function getAiSettings(userId: string): Promise<AiSettings> {
  const user = await UserModel.findById(userId).lean();
  if (!user) throw new AppError(404, "USER_NOT_FOUND", "User was not found");
  return normalizeSettings(user.aiSettings);
}

export async function updateAiSettings(userId: string, patch: AiSettingsPatch): Promise<AiSettings> {
  const set: Record<string, unknown> = {};
  if (patch.modelTier !== undefined) set["aiSettings.modelTier"] = patch.modelTier;
  if (patch.enabled !== undefined) set["aiSettings.enabled"] = patch.enabled;
  if (patch.suggestionsEnabled !== undefined) set["aiSettings.suggestionsEnabled"] = patch.suggestionsEnabled;
  if (patch.sentimentEnabled !== undefined) set["aiSettings.sentimentEnabled"] = patch.sentimentEnabled;
  if (patch.suggestionMode !== undefined) set["aiSettings.suggestionMode"] = patch.suggestionMode;
  if (patch.sentimentWindow !== undefined) set["aiSettings.sentimentWindow"] = patch.sentimentWindow;
  // Lấy pre-image trong cùng thao tác ghi để hai lần lưu đồng thời không dùng chung bản cũ.
  const user = await UserModel.findByIdAndUpdate(userId, { $set: set }, { returnDocument: "before" }).lean();
  if (!user) throw new AppError(404, "USER_NOT_FOUND", "User was not found");
  const oldSettings = normalizeSettings(user.aiSettings);
  const newSettings = normalizeSettings({
    ...oldSettings,
    ...Object.fromEntries(Object.entries(set).map(([key, value]) => [key.slice("aiSettings.".length), value]))
  });
  recordSettingHistorySafely({
    userId,
    actionType: "UPDATE_AI_SETTINGS",
    actionTitle: "Cập nhật cài đặt AI",
    oldValue: oldSettings,
    newValue: newSettings
  });
  return newSettings;
}
