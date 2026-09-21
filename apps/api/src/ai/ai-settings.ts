export const aiModelTiers = ["smart", "balanced", "economy"] as const;
export type AiModelTier = (typeof aiModelTiers)[number];

export const aiSuggestionModes = ["off", "manual", "on_open", "on_customer_message"] as const;
export type AiSuggestionMode = (typeof aiSuggestionModes)[number];

export const aiSentimentWindows = [3, 6, 10] as const;
export type AiSentimentWindow = (typeof aiSentimentWindows)[number];

export type AiSuggestionTrigger = "manual" | "conversation_open" | "customer_message";

export interface AiSettings {
  modelTier: AiModelTier;
  enabled: boolean;
  suggestionsEnabled: boolean;
  sentimentEnabled: boolean;
  suggestionMode: AiSuggestionMode;
  sentimentWindow: AiSentimentWindow;
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
  modelTier: "smart",
  enabled: true,
  suggestionsEnabled: true,
  sentimentEnabled: true,
  suggestionMode: "on_open",
  sentimentWindow: 3
};

export function modelTierToGeminiModel(tier: AiModelTier): string {
  if (tier === "smart") return "gemini-3.5-flash";
  if (tier === "balanced") return "gemini-3.6-flash";
  return "gemini-3.5-flash-lite";
}

export function shouldGenerateSuggestions(
  mode: AiSuggestionMode,
  trigger: AiSuggestionTrigger
): boolean {
  if (mode === "off") return false;
  // Nút làm mới là yêu cầu chủ động của nhân viên, không bị giới hạn bởi lịch tự động.
  if (trigger === "manual") return true;
  if (trigger === "conversation_open") return mode === "on_open";
  return mode === "on_customer_message";
}
