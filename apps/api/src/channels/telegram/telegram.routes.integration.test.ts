import request from "supertest";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { createApp } from "../../app.js";
import { issueTokens } from "../../services/auth.service.js";

process.env.JWT_SECRET ??= "test-jwt-secret-that-is-at-least-32-characters";
process.env.TELEGRAM_WEBHOOK_SECRET = "telegram-webhook-secret-value";

let adminAccessToken: string;
let customerAccessToken: string;

describe("Telegram route authentication and validation", () => {
  afterEach(() => vi.restoreAllMocks());

  beforeAll(async () => {
    [adminAccessToken, customerAccessToken] = await Promise.all([
      issueTokens({ id: "admin-1", email: "admin@example.com", role: "admin" }).then(
        ({ accessToken }) => accessToken
      ),
      issueTokens({ id: "customer-1", email: "customer@example.com", role: "customer" }).then(
        ({ accessToken }) => accessToken
      )
    ]);
  });

  it("rejects anonymous Telegram bot registration through the role middleware", async () => {
    const response = await request(createApp())
      .post("/api/v1/channels/telegram")
      .send({ botToken: "bot-token", webhookBaseUrl: "https://chat.example.com" });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: { code: "AUTHENTICATION_REQUIRED", message: "A Bearer token is required" }
    });
  });

  it("rejects non-admin Telegram bot registration through the role middleware", async () => {
    const response = await request(createApp())
      .post("/api/v1/channels/telegram")
      .set("Authorization", `Bearer ${customerAccessToken}`)
      .send({ botToken: "bot-token", webhookBaseUrl: "https://chat.example.com" });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: { code: "FORBIDDEN", message: "You do not have permission for this resource" }
    });
  });

  it.each([
    ["get", "/api/v1/channels/telegram-personal/status"],
    ["post", "/api/v1/channels/telegram-personal/qr"],
    ["get", "/api/v1/channels/telegram-personal/qr/qr-1"],
    ["post", "/api/v1/channels/telegram-personal/qr/qr-1/password"]
  ] as const)("requires authentication for personal Telegram %s %s", async (method, path) => {
    const response = await request(createApp())[method](path).send({ password: "secret" });

    expect(response.status).toBe(401);
    expect(response.body.error?.code).toBe("AUTHENTICATION_REQUIRED");
  });

  it("preserves INTERNAL_ERROR for an invalid Telegram registration body", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await request(createApp())
      .post("/api/v1/channels/telegram")
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ botToken: "", webhookBaseUrl: "not-a-url" });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" }
    });
  });

  it("preserves INTERNAL_ERROR for an invalid Telegram webhook update", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await request(createApp())
      .post("/api/v1/channels/telegram/webhook/telegram-webhook-secret-value")
      .send({ update_id: "not-a-number" });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" }
    });
  });

  it("allows an authenticated personal role to reach password validation", async () => {
    const response = await request(createApp())
      .post("/api/v1/channels/telegram-personal/qr/qr-1/password")
      .set("Authorization", `Bearer ${customerAccessToken}`)
      .send({ password: "   " });

    expect(response.status).toBe(400);
    expect(response.body.error?.code).toBe("INVALID_REQUEST");
  });
});
