import { describe, expect, it } from "vitest";

import {
  DEFAULT_AI_SETTINGS,
  modelTierToGeminiModel,
  shouldGenerateSuggestions,
  type AiSuggestionTrigger
} from "./ai-settings.js";

describe("AI settings", () => {
  it("maps the three UI model tiers to supported Gemini models", () => {
    expect(modelTierToGeminiModel("smart")).toBe("gemini-3.5-flash");
    expect(modelTierToGeminiModel("balanced")).toBe("gemini-3.6-flash");
    expect(modelTierToGeminiModel("economy")).toBe("gemini-3.5-flash-lite");
  });

  it("starts enabled with open-conversation suggestions and a three-message sentiment window", () => {
    expect(DEFAULT_AI_SETTINGS).toEqual({
      modelTier: "smart",
      enabled: true,
      suggestionsEnabled: true,
      sentimentEnabled: true,
      suggestionMode: "on_open",
      sentimentWindow: 3
    });
  });

  it("only generates suggestions for the configured trigger", () => {
    const triggers: AiSuggestionTrigger[] = ["manual", "conversation_open", "customer_message"];

    expect(triggers.filter((trigger) => shouldGenerateSuggestions("manual", trigger))).toEqual(["manual"]);
    expect(triggers.filter((trigger) => shouldGenerateSuggestions("on_open", trigger))).toEqual(["conversation_open"]);
    expect(triggers.filter((trigger) => shouldGenerateSuggestions("on_customer_message", trigger))).toEqual(["customer_message"]);
    expect(shouldGenerateSuggestions("off", "manual")).toBe(false);
  });
});
