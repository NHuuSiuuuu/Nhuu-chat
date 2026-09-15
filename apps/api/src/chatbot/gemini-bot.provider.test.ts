import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { generateContent } = vi.hoisted(() => ({
  generateContent: vi.fn()
}));

vi.mock("@google/genai", () => ({
  Type: { BOOLEAN: "BOOLEAN", OBJECT: "OBJECT", STRING: "STRING" },
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
  GEMINI_API_KEY: "gemini-test-key",
  GEMINI_CHAT_MODEL: "gemini-3.5-flash-lite"
};

const assistant = {
  instructions: "Chỉ trả lời lịch sự theo chính sách cửa hàng.",
  modelTier: "balanced" as const,
  fallbackMessage: "Nhân viên sẽ hỗ trợ bạn ngay."
};

async function importProvider() {
  vi.resetModules();
  for (const [name, value] of Object.entries(validEnvironment)) {
    vi.stubEnv(name, value);
  }
  return import("./gemini-bot.provider.js");
}

afterEach(() => {
  generateContent.mockReset();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("Gemini bot reply provider", () => {
  beforeEach(() => {
    generateContent.mockResolvedValue({
      text: JSON.stringify({ answer: "Câu trả lời có căn cứ.", grounded: true, handoff: false })
    });
  });

  it("returns the exact template without calling Gemini when rewrite is disabled", async () => {
    const { GeminiBotProvider } = await importProvider();
    const provider = new GeminiBotProvider();

    const result = await provider.reply({
      assistant,
      message: "Phí giao hàng bao nhiêu?",
      template: { responseTemplate: "Phí giao hàng là 30.000đ.", allowAiRewrite: false }
    });

    expect(result).toEqual({ answer: "Phí giao hàng là 30.000đ.", handoff: false, sources: [] });
    expect(generateContent).not.toHaveBeenCalled();
  });

  it("rewrites a template through a meaning-preserving structured prompt", async () => {
    generateContent.mockResolvedValue({
      text: JSON.stringify({
        answer: "Dạ, phí giao hàng vẫn là 30.000đ ạ.",
        grounded: true,
        handoff: false
      })
    });
    const { GeminiBotProvider } = await importProvider();
    const provider = new GeminiBotProvider();

    await expect(provider.reply({
      assistant,
      message: "Ship hết bao nhiêu?",
      history: [{ role: "customer", content: "Tôi ở Đà Nẵng." }],
      template: { responseTemplate: "Phí giao hàng là 30.000đ.", allowAiRewrite: true }
    })).resolves.toEqual({
      answer: "Dạ, phí giao hàng vẫn là 30.000đ ạ.",
      handoff: false,
      sources: []
    });

    expect(generateContent.mock.calls[0][0].model).toBe("gemini-3.6-flash");
    expect(generateContent.mock.calls[0][0].contents).toContain("Phí giao hàng là 30.000đ.");
    expect(generateContent.mock.calls[0][0].contents).toContain("không thay đổi ý nghĩa");
    expect(generateContent.mock.calls[0][0].config).toEqual(expect.objectContaining({
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          answer: { type: "STRING" },
          grounded: { type: "BOOLEAN" },
          handoff: { type: "BOOLEAN" }
        },
        required: ["answer", "grounded", "handoff"]
      },
      abortSignal: expect.any(AbortSignal),
      httpOptions: { timeout: 10_000 }
    }));
  });

  it("uses bounded instructions, recent history, and strong RAG context", async () => {
    const { GeminiBotProvider } = await importProvider();
    const provider = new GeminiBotProvider();
    const history = Array.from({ length: 14 }, (_, index) => ({
      role: index % 2 === 0 ? "customer" as const : "bot" as const,
      content: index === 0 ? `oldest-${"x".repeat(1_200)}` : `turn-${index}`
    }));
    const context = Array.from({ length: 7 }, (_, index) => ({
      documentId: `document-${index}`,
      chunkIndex: index,
      content: index === 5 ? "excluded-sixth-context" : `policy-${index}-${"y".repeat(1_700)}`,
      score: 0.9
    }));

    const result = await provider.reply({
      assistant: { ...assistant, instructions: `instruction-${"i".repeat(5_000)}-excluded-tail` },
      message: `question-${"q".repeat(2_500)}-excluded-tail`,
      history,
      context
    });

    expect(result).toEqual({
      answer: "Câu trả lời có căn cứ.",
      handoff: false,
      sources: [
        { documentId: "document-0", chunkIndex: 0 },
        { documentId: "document-1", chunkIndex: 1 },
        { documentId: "document-2", chunkIndex: 2 },
        { documentId: "document-3", chunkIndex: 3 },
        { documentId: "document-4", chunkIndex: 4 }
      ]
    });

    const prompt = generateContent.mock.calls[0][0].contents as string;
    expect(prompt).toContain("Chỉ sử dụng ngữ cảnh kiến thức được cung cấp");
    expect(prompt).toContain("turn-13");
    expect(prompt).toContain("policy-4");
    expect(prompt).not.toContain("oldest-");
    expect(prompt).not.toContain("excluded-sixth-context");
    expect(prompt).not.toContain("excluded-tail");
    expect(prompt.length).toBeLessThanOrEqual(16_000);
  });

  it("returns the configured fallback without Gemini when RAG context is weak", async () => {
    const { GeminiBotProvider } = await importProvider();
    const provider = new GeminiBotProvider();

    await expect(provider.reply({
      assistant,
      message: "Chính sách đổi hàng?",
      context: [{
        documentId: "weak-document",
        chunkIndex: 0,
        content: "Nội dung không đủ liên quan",
        score: 0.34
      }]
    })).resolves.toEqual({
      answer: "Nhân viên sẽ hỗ trợ bạn ngay.",
      handoff: true,
      sources: []
    });
    expect(generateContent).not.toHaveBeenCalled();
  });

  it("uses assistant instructions for general questions when no RAG context exists", async () => {
    const { GeminiBotProvider } = await importProvider();
    const provider = new GeminiBotProvider();

    await expect(provider.reply({
      assistant: {
        ...assistant,
        instructions: "Bạn là trợ lý tư vấn tình cảm. Hãy trả lời bằng tiếng Việt, lịch sự và chính xác."
      },
      message: "Tư vấn tình cảm",
      context: []
    })).resolves.toEqual({
      answer: "Câu trả lời có căn cứ.",
      handoff: false,
      sources: []
    });
    expect(generateContent).toHaveBeenCalledOnce();
    expect(generateContent.mock.calls[0][0].contents).toContain("trợ lý tư vấn tình cảm");
  });

  it("falls back when Gemini marks an answer as ungrounded", async () => {
    generateContent.mockResolvedValue({
      text: JSON.stringify({ answer: "Có thể đổi trong 90 ngày.", grounded: false, handoff: false })
    });
    const { GeminiBotProvider } = await importProvider();
    const provider = new GeminiBotProvider();

    await expect(provider.reply({
      assistant,
      message: "Đổi hàng trong bao lâu?",
      context: [{ documentId: "policy", chunkIndex: 0, content: "Liên hệ nhân viên", score: 0.8 }]
    })).resolves.toEqual({
      answer: "Nhân viên sẽ hỗ trợ bạn ngay.",
      handoff: true,
      sources: []
    });
  });

  it("aborts after ten seconds and keeps timeout details internal", async () => {
    vi.useFakeTimers();
    generateContent.mockImplementation(() => new Promise(() => undefined));
    const { GeminiBotProvider } = await importProvider();
    const provider = new GeminiBotProvider();
    const pending = provider.reply({
      assistant,
      message: "Đổi hàng trong bao lâu?",
      context: [{ documentId: "policy", chunkIndex: 0, content: "Đổi trong 7 ngày", score: 0.8 }]
    });

    await vi.advanceTimersByTimeAsync(10_000);

    await expect(pending).resolves.toEqual({
      answer: "Nhân viên sẽ hỗ trợ bạn ngay.",
      handoff: true,
      sources: []
    });
    expect(generateContent.mock.calls[0][0].config.abortSignal.aborted).toBe(true);
  });

  it("keeps Gemini errors internal and returns the grounded fallback", async () => {
    generateContent.mockRejectedValue(new Error("provider-secret-detail"));
    const { GeminiBotProvider } = await importProvider();
    const provider = new GeminiBotProvider();

    const result = await provider.reply({
      assistant,
      message: "Đổi hàng trong bao lâu?",
      context: [{ documentId: "policy", chunkIndex: 0, content: "Đổi trong 7 ngày", score: 0.8 }]
    });

    expect(result).toEqual({
      answer: "Nhân viên sẽ hỗ trợ bạn ngay.",
      handoff: true,
      sources: []
    });
    expect(JSON.stringify(result)).not.toContain("provider-secret-detail");
  });

  it("uses the configured chat model when the selected model is unavailable", async () => {
    generateContent
      .mockRejectedValueOnce(new Error("RESOURCE_EXHAUSTED"))
      .mockResolvedValueOnce({
        text: JSON.stringify({ answer: "Bạn có thể thử trà sữa ô long ạ.", grounded: true, handoff: false })
      });
    const { GeminiBotProvider } = await importProvider();
    const provider = new GeminiBotProvider();

    await expect(provider.reply({
      assistant: { ...assistant, modelTier: "smart" },
      message: "Tư vấn cho tôi một món trà sữa",
      context: [{ documentId: "menu", chunkIndex: 0, content: "Trà sữa ô long", score: 0.9 }]
    })).resolves.toEqual({
      answer: "Bạn có thể thử trà sữa ô long ạ.",
      handoff: false,
      sources: [{ documentId: "menu", chunkIndex: 0 }]
    });
    expect(generateContent.mock.calls.map(([request]) => request.model)).toEqual([
      "gemini-3.5-flash",
      "gemini-3.5-flash-lite"
    ]);
  });
});
