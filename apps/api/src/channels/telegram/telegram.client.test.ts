import { afterEach, describe, expect, it, vi } from "vitest";

import { TelegramClient } from "./telegram.client.js";

describe("TelegramClient", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends text and returns a canonical external delivery", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          result: { message_id: 321 }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    const client = new TelegramClient("123456:secret-token", { fetch: fetchMock });

    await expect(client.sendText("456", "Xin chào")).resolves.toEqual({
      externalMessageId: "321",
      status: "sent"
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.telegram.org/bot123456:secret-token/sendMessage",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: "456", text: "Xin chào" }),
        signal: expect.any(AbortSignal)
      })
    );
  });

  it("registers a webhook with Telegram secret-token verification", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, result: true }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    const client = new TelegramClient("123456:secret-token", { fetch: fetchMock });

    await client.setWebhook("https://chat.example.com/telegram/webhook", "webhook-secret");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.telegram.org/bot123456:secret-token/setWebhook",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          url: "https://chat.example.com/telegram/webhook",
          secret_token: "webhook-secret"
        })
      })
    );
  });

  it("rejects invalid Telegram responses without leaking the bot token", async () => {
    const botToken = "123456:must-not-leak";
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ok: false, description: `Rejected ${botToken}` }), {
        status: 401,
        headers: { "content-type": "application/json" }
      })
    );
    const client = new TelegramClient(botToken, { fetch: fetchMock });

    const error = await client.sendText("456", "Xin chào").catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("Telegram API request failed with status 401");
    expect((error as Error).message).not.toContain(botToken);
  });

  it("aborts requests that exceed the configured timeout", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((_input, init) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      });
    });
    const client = new TelegramClient("123456:secret-token", {
      fetch: fetchMock,
      timeoutMs: 50
    });

    const rejection = expect(client.sendText("456", "Xin chào")).rejects.toThrow(
      "Telegram API request timed out"
    );
    await vi.advanceTimersByTimeAsync(51);
    await rejection;
  });
});
