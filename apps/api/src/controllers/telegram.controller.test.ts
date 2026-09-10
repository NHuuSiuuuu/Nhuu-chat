import { beforeEach, describe, expect, it, vi } from "vitest";

const serviceMocks = vi.hoisted(() => ({
  ingestTelegramUpdate: vi.fn(),
  registerTelegramChannel: vi.fn()
}));

vi.mock("../services/telegram.service.js", () => serviceMocks);

import { ingestWebhook, registerChannel } from "./telegram.controller.js";

function responseRecorder() {
  const state: { body?: unknown; sent: boolean; statusCode: number } = {
    sent: false,
    statusCode: 200
  };
  const response = {
    json(body: unknown) {
      state.body = body;
      return response;
    },
    send() {
      state.sent = true;
      return response;
    },
    status(statusCode: number) {
      state.statusCode = statusCode;
      return response;
    }
  };
  return { response, state };
}

describe("Telegram controller", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.TELEGRAM_WEBHOOK_SECRET = "expected-secret";
  });

  it("rejects an invalid webhook secret without ingesting the update", async () => {
    const { response, state } = responseRecorder();
    const next = vi.fn();

    await ingestWebhook({ params: { secret: "wrong-secret" }, body: { update_id: 1 } } as never, response as never, next);

    expect(state.statusCode).toBe(401);
    expect(state.body).toEqual({
      error: { code: "INVALID_WEBHOOK_SECRET", message: "Webhook secret is invalid" }
    });
    expect(serviceMocks.ingestTelegramUpdate).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("validates and delegates a webhook update before acknowledging it", async () => {
    const update = { update_id: 1 };
    const { response, state } = responseRecorder();
    const next = vi.fn();

    await ingestWebhook({ params: { secret: "expected-secret" }, body: update } as never, response as never, next);

    expect(serviceMocks.ingestTelegramUpdate).toHaveBeenCalledWith(update);
    expect(state.statusCode).toBe(204);
    expect(state.sent).toBe(true);
    expect(next).not.toHaveBeenCalled();
  });

  it("validates and delegates Telegram channel registration", async () => {
    const registered = { provider: "telegram", webhookUrl: "https://chat.example.com/webhook" };
    serviceMocks.registerTelegramChannel.mockResolvedValue(registered);
    const { response, state } = responseRecorder();
    const next = vi.fn();

    await registerChannel({
      body: { botToken: "  bot-token  ", webhookBaseUrl: "https://chat.example.com" }
    } as never, response as never, next);

    expect(serviceMocks.registerTelegramChannel).toHaveBeenCalledWith({
      botToken: "bot-token",
      webhookBaseUrl: "https://chat.example.com"
    });
    expect(state.statusCode).toBe(201);
    expect(state.body).toEqual(registered);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects invalid registration input before calling the service", async () => {
    const { response } = responseRecorder();
    const next = vi.fn();

    await registerChannel({ body: { botToken: "", webhookBaseUrl: "not-a-url" } } as never, response as never, next);

    expect(serviceMocks.registerTelegramChannel).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
  });
});
