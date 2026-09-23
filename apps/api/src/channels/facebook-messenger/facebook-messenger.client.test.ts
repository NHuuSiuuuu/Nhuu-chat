import { beforeAll, describe, expect, it, vi } from "vitest";

let FacebookMessengerClient: typeof import("./facebook-messenger.client.js").FacebookMessengerClient;

beforeAll(async () => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("MONGODB_URI", "mongodb://localhost:27017/nhuu-chat");
  vi.stubEnv("REDIS_URL", "redis://localhost:6379");
  vi.stubEnv("JWT_SECRET", "a-jwt-secret-that-is-at-least-32-characters");
  vi.stubEnv("ENCRYPTION_KEY", "an-encryption-key-that-is-32-characters");
  vi.stubEnv("TELEGRAM_BOT_TOKEN", "123456789:test-token");
  vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "a-telegram-webhook-secret");
  ({ FacebookMessengerClient } = await import("./facebook-messenger.client.js"));
});

function graphResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("FacebookMessengerClient", () => {
  it("sends a text response to the exact Page endpoint and returns only the Meta message ID", async () => {
    const fetchGraph = vi.fn().mockResolvedValue(graphResponse({ recipient_id: "psid-1", message_id: "mid-1" }));
    const client = new FacebookMessengerClient({ fetchGraph, graphApiVersion: "v26.0" });

    await expect(client.sendText({ pageId: "page-1", pageAccessToken: "private-token", psid: "psid-1", text: "Hello" }))
      .resolves.toEqual({ externalMessageId: "mid-1" });

    expect(fetchGraph).toHaveBeenCalledWith("https://graph.facebook.com/v26.0/page-1/messages", expect.objectContaining({
      method: "POST",
      headers: { authorization: "Bearer private-token", "content-type": "application/json" },
      body: JSON.stringify({ recipient: { id: "psid-1" }, messaging_type: "RESPONSE", message: { text: "Hello" } })
    }));
  });

  it("subscribes the Page to only messages and message_echoes", async () => {
    const fetchGraph = vi.fn().mockResolvedValue(graphResponse({ success: true }));
    const client = new FacebookMessengerClient({ fetchGraph, graphApiVersion: "v26.0" });

    await client.subscribePage({ pageId: "page-1", pageAccessToken: "private-token" });

    expect(fetchGraph).toHaveBeenCalledWith("https://graph.facebook.com/v26.0/page-1/subscribed_apps", expect.objectContaining({
      method: "POST", headers: { authorization: "Bearer private-token", "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ subscribed_fields: "messages,message_echoes" })
    }));
  });

  it("unsubscribes the Page with its Page access token", async () => {
    const fetchGraph = vi.fn().mockResolvedValue(graphResponse({ success: true }));
    const client = new FacebookMessengerClient({ fetchGraph, graphApiVersion: "v26.0" });

    await client.unsubscribePage({ pageId: "page-1", pageAccessToken: "private-token" });

    expect(fetchGraph).toHaveBeenCalledWith("https://graph.facebook.com/v26.0/page-1/subscribed_apps", expect.objectContaining({
      method: "DELETE", headers: { authorization: "Bearer private-token" }
    }));
  });

  it.each([
    [200, undefined, 403, "FACEBOOK_MESSENGER_PERMISSION_DENIED"],
    [190, undefined, 401, "FACEBOOK_MESSENGER_TOKEN_INVALID"],
    [10, 2018278, 422, "FACEBOOK_MESSENGER_POLICY_WINDOW_CLOSED"],
    [613, undefined, 429, "FACEBOOK_MESSENGER_RATE_LIMITED"]
  ])("maps Graph error %s/%s without exposing its response", async (code, subcode, statusCode, stableCode) => {
    const privateText = "private-token secret Meta response";
    const fetchGraph = vi.fn().mockResolvedValue(graphResponse({ error: { code, error_subcode: subcode, message: privateText } }, 400));
    const client = new FacebookMessengerClient({ fetchGraph });

    const error = await client.sendText({ pageId: "page-1", pageAccessToken: "private-token", psid: "psid-1", text: "Hello" })
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({ statusCode, code: stableCode });
    expect(JSON.stringify(error)).not.toMatch(/private-token|secret Meta response/);
    expect((error as Error).message).not.toContain(privateText);
  });

  it("maps subscription permission failure to a stable error", async () => {
    const fetchGraph = vi.fn().mockResolvedValue(graphResponse({ error: { code: 200, message: "private-token" } }, 403));
    const client = new FacebookMessengerClient({ fetchGraph });

    await expect(client.subscribePage({ pageId: "page-1", pageAccessToken: "private-token" }))
      .rejects.toMatchObject({ code: "FACEBOOK_MESSENGER_PERMISSION_DENIED", statusCode: 403 });
  });

  it("bounds a stalled Graph response and aborts the request", async () => {
    let signal: AbortSignal | undefined;
    const fetchGraph = vi.fn((_url: string, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>(() => undefined);
    });
    const client = new FacebookMessengerClient({ fetchGraph, timeoutMs: 50 });
    vi.useFakeTimers();
    try {
      const pending = client.sendText({ pageId: "page-1", pageAccessToken: "private-token", psid: "psid-1", text: "Hello" })
        .catch((caught: unknown) => caught);
      await vi.advanceTimersByTimeAsync(50);
      expect(signal?.aborted).toBe(true);
      expect(await pending).toMatchObject({ code: "FACEBOOK_MESSENGER_TIMEOUT", statusCode: 504 });
    } finally {
      vi.useRealTimers();
    }
  });

  it("maps an upstream ETIMEDOUT rejection to the timeout code", async () => {
    const fetchGraph = vi.fn().mockRejectedValue({ code: "ETIMEDOUT", message: "private-token timed out" });
    const client = new FacebookMessengerClient({ fetchGraph });

    const error = await client.sendText({ pageId: "page-1", pageAccessToken: "private-token", psid: "psid-1", text: "Hello" })
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({ code: "FACEBOOK_MESSENGER_TIMEOUT", statusCode: 504 });
    expect((error as Error).message).not.toContain("private-token");
  });

  it("bounds stalled Graph JSON parsing", async () => {
    let signal: AbortSignal | undefined;
    const fetchGraph = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return Promise.resolve({ ok: true, status: 200, json: () => new Promise<unknown>(() => undefined) });
    });
    const client = new FacebookMessengerClient({ fetchGraph, timeoutMs: 50 });
    vi.useFakeTimers();
    try {
      const pending = client.subscribePage({ pageId: "page-1", pageAccessToken: "private-token" })
        .catch((caught: unknown) => caught);
      await vi.advanceTimersByTimeAsync(50);
      expect(signal?.aborted).toBe(true);
      expect(await pending).toMatchObject({ code: "FACEBOOK_MESSENGER_TIMEOUT", statusCode: 504 });
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects malformed successful responses safely", async () => {
    const fetchGraph = vi.fn().mockResolvedValue(graphResponse({ recipient_id: "psid-1", message_id: 10 }));
    const client = new FacebookMessengerClient({ fetchGraph });

    await expect(client.sendText({ pageId: "page-1", pageAccessToken: "private-token", psid: "psid-1", text: "Hello" }))
      .rejects.toMatchObject({ code: "FACEBOOK_MESSENGER_SEND_FAILED", statusCode: 502 });
  });

  it("redacts transport exception strings and malformed JSON", async () => {
    const fetchGraph = vi.fn().mockRejectedValueOnce(new Error("private-token raw Meta exception"))
      .mockResolvedValueOnce(new Response("private-token invalid json", { status: 200 }));
    const client = new FacebookMessengerClient({ fetchGraph });

    for (let index = 0; index < 2; index += 1) {
      const error = await client.sendText({ pageId: "page-1", pageAccessToken: "private-token", psid: "psid-1", text: "Hello" })
        .catch((caught: unknown) => caught);
      expect(error).toMatchObject({ code: "FACEBOOK_MESSENGER_SEND_FAILED" });
      expect(JSON.stringify(error)).not.toMatch(/private-token|raw Meta exception/);
    }
  });
});
