import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { generateContent } = vi.hoisted(() => ({
  generateContent: vi.fn()
}));

vi.mock("@google/genai", () => ({
  Type: { OBJECT: "OBJECT", ARRAY: "ARRAY", STRING: "STRING" },
  GoogleGenAI: vi.fn(() => ({
    models: { generateContent }
  }))
}));

const validEnvironment = {
  NODE_ENV: "test",
  PORT: "3000",
  MONGODB_URI: "mongodb://localhost:27017/nhuu-chat?replicaSet=rs0",
  REDIS_URL: "redis://localhost:6379",
  JWT_SECRET: "a-jwt-secret-that-is-at-least-32-characters",
  ENCRYPTION_KEY: "an-encryption-key-that-is-32-characters",
  TELEGRAM_BOT_TOKEN: "123456789:test-token",
  TELEGRAM_WEBHOOK_SECRET: "a-telegram-webhook-secret",
  GEMINI_API_KEY: "gemini-test-key"
};

async function importProvider() {
  vi.resetModules();

  for (const [name, value] of Object.entries(validEnvironment)) {
    vi.stubEnv(name, value);
  }

  return import("./reply-suggestion.provider.js");
}

afterEach(() => {
  generateContent.mockReset();
  vi.unstubAllEnvs();
});

describe("Gemini reply suggestion provider", () => {
  beforeEach(() => {
    generateContent.mockResolvedValue({
      text: JSON.stringify({
        suggestions: [
          "First suggestion",
          "Second suggestion",
          "Third suggestion",
          "Extra suggestion"
        ]
      })
    });
  });

  it("normalizes a Gemini response to three non-empty suggestions", async () => {
    const { GeminiReplySuggestionProvider } = await importProvider();
    const provider = new GeminiReplySuggestionProvider();

    await expect(
      provider.suggest({ latestCustomerMessage: "Can you help me?" })
    ).resolves.toEqual([
      "First suggestion",
      "Second suggestion",
      "Third suggestion"
    ]);
  });

  it("rejects invalid JSON responses", async () => {
    generateContent.mockResolvedValue({ text: "not-json" });
    const { GeminiReplySuggestionProvider } = await importProvider();
    const provider = new GeminiReplySuggestionProvider();

    await expect(
      provider.suggest({ latestCustomerMessage: "Can you help me?" })
    ).rejects.toThrow();
  });

  it("rejects provider errors", async () => {
    generateContent.mockRejectedValue(new Error("Gemini unavailable"));
    const { GeminiReplySuggestionProvider } = await importProvider();
    const provider = new GeminiReplySuggestionProvider();

    await expect(
      provider.suggest({ latestCustomerMessage: "Can you help me?" })
    ).rejects.toThrow("Gemini unavailable");
  });
});
