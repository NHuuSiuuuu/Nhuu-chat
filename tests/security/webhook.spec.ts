import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../../apps/api/src/app.js";
import { issueTokens } from "../../apps/api/src/auth/auth.service.js";

process.env.JWT_SECRET ??= "test-jwt-secret-that-is-at-least-32-characters";
process.env.TELEGRAM_WEBHOOK_SECRET = "telegram-webhook-secret-value";

describe("Task 8 security verification", () => {
  it("sets baseline security headers and a request ID", async () => {
    const response = await request(createApp()).get("/health").set("X-Request-Id", "security-test-1");

    expect(response.status).toBe(200);
    expect(response.headers["x-request-id"]).toBe("security-test-1");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-frame-options"]).toBe("DENY");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(response.headers["content-security-policy"]).toBe("default-src 'self'");
  });

  it("only exposes CORS credentials to an allowlisted web origin", async () => {
    process.env.WEB_ALLOWED_ORIGINS = "http://localhost:5173";

    const allowed = await request(createApp()).get("/health").set("Origin", "http://localhost:5173");
    const denied = await request(createApp()).get("/health").set("Origin", "https://attacker.example");

    expect(allowed.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(allowed.headers["access-control-allow-credentials"]).toBe("true");
    expect(denied.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("rejects missing auth and a customer token on an admin-only endpoint", async () => {
    const missing = await request(createApp()).post("/api/v1/channels/telegram").send({});
    const { accessToken } = await issueTokens({
      id: "507f1f77bcf86cd799439011",
      email: "customer@example.com",
      role: "customer"
    });
    const wrongRole = await request(createApp())
      .post("/api/v1/channels/telegram")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({});

    expect(missing.status).toBe(401);
    expect(missing.body.error.code).toBe("AUTHENTICATION_REQUIRED");
    expect(wrongRole.status).toBe(403);
    expect(wrongRole.body.error.code).toBe("FORBIDDEN");
  });

  it("rejects a forged Telegram webhook without invoking ingestion", async () => {
    const response = await request(createApp())
      .post("/api/v1/channels/telegram/webhook/forged-secret")
      .send({ update_id: 9001, message: { message_id: 1 } });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INVALID_WEBHOOK_SECRET");
  });
});
