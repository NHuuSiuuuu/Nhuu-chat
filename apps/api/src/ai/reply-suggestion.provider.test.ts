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
      provider.suggest({ conversationContext: "Khách hàng: Can you help me?" })
    ).resolves.toEqual([
      "First suggestion",
      "Second suggestion",
      "Third suggestion"
    ]);
  });

  it("sends the Vietnamese reply prompt and JSON schema grounded on the conversation context", async () => {
    const { GeminiReplySuggestionProvider } = await importProvider();
    const provider = new GeminiReplySuggestionProvider();

    await provider.suggest({ conversationContext: "Khách hàng: Tôi muốn đổi sản phẩm.\nNhân viên: Em hỗ trợ ạ." });

    expect(generateContent).toHaveBeenCalledWith({
      model: "gemini-3.5-flash-lite",
      contents: expect.stringContaining("Khách hàng: Tôi muốn đổi sản phẩm."),
      config: expect.objectContaining({
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            suggestions: {
              type: "ARRAY",
              items: { type: "STRING" }
            }
          },
          required: ["suggestions"]
        },
        abortSignal: expect.any(AbortSignal),
        httpOptions: { timeout: 10_000 }
      })
    });

    expect(generateContent.mock.calls[0][0].contents).toContain(
      "short, polite Vietnamese customer-service replies"
    );
    expect(generateContent.mock.calls[0][0].contents).toContain(
      "polite Vietnamese customer-service replies"
    );
    expect(generateContent.mock.calls[0][0].contents).toContain(
      "Do not invent prices, policies, order status, or claim unsupported actions"
    );
  });

  it("uses the selected Gemini model tier", async () => {
    const { GeminiReplySuggestionProvider } = await importProvider();
    const provider = new GeminiReplySuggestionProvider();

    await provider.suggest({ conversationContext: "Khách hàng: Xin chào", modelTier: "smart" });

    expect(generateContent.mock.calls[0][0].model).toBe("gemini-3.5-flash");
  });

  it("falls back to an available low-latency model when the selected model is temporarily unavailable", async () => {
    generateContent
      .mockRejectedValueOnce(new Error('{"error":{"code":503,"status":"UNAVAILABLE"}}'))
      .mockResolvedValueOnce({
        text: JSON.stringify({ suggestions: ["Gợi ý dự phòng"] })
      });
    const { GeminiReplySuggestionProvider } = await importProvider();
    const provider = new GeminiReplySuggestionProvider();

    await expect(
      provider.suggest({ conversationContext: "Khách hàng: Xin chào", modelTier: "smart" })
    ).resolves.toEqual(["Gợi ý dự phòng"]);

    expect(generateContent.mock.calls.map(([request]) => request.model)).toEqual([
      "gemini-3.5-flash",
      "gemini-3.1-flash-lite"
    ]);
  });

  it("filters non-strings and empty values and caps suggestions at 240 characters", async () => {
    generateContent.mockResolvedValue({
      text: JSON.stringify({
        suggestions: [
          " ",
          42,
          "A".repeat(241),
          "Useful reply",
          "Another useful reply",
          "Third useful reply",
          "Fourth useful reply"
        ]
      })
    });
    const { GeminiReplySuggestionProvider } = await importProvider();
    const provider = new GeminiReplySuggestionProvider();

    await expect(
      provider.suggest({ conversationContext: "Khách hàng: Cần hỗ trợ" })
    ).resolves.toEqual(["A".repeat(240), "Useful reply", "Another useful reply"]);
  });

  it("aborts the Gemini request when the timeout expires", async () => {
    vi.useFakeTimers();
    generateContent.mockImplementation(() => new Promise(() => undefined));
    const { GeminiReplySuggestionProvider } = await importProvider();
    const provider = new GeminiReplySuggestionProvider();
    const suggestionRequest = provider
      .suggest({ conversationContext: "Khách hàng: Xin chào" })
      .catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(10_000);

    await expect(suggestionRequest).resolves.toMatchObject({
      message: "Gemini request timed out"
    });
    expect(generateContent.mock.calls[0][0].config.abortSignal.aborted).toBe(true);
    vi.useRealTimers();
  });

  it("rejects invalid JSON responses", async () => {
    generateContent.mockResolvedValue({ text: "not-json" });
    const { GeminiReplySuggestionProvider } = await importProvider();
    const provider = new GeminiReplySuggestionProvider();

    await expect(
      provider.suggest({ conversationContext: "Khách hàng: Can you help me?" })
    ).rejects.toThrow();
  });

  it("rejects provider errors", async () => {
    generateContent.mockRejectedValue(new Error("Gemini unavailable"));
    const { GeminiReplySuggestionProvider } = await importProvider();
    const provider = new GeminiReplySuggestionProvider();

    await expect(
      provider.suggest({ conversationContext: "Khách hàng: Can you help me?" })
    ).rejects.toThrow("Gemini unavailable");
  });
});
