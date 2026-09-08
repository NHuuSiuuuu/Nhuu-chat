import { afterEach, describe, expect, it, vi } from "vitest";

const validEnvironment = {
  NODE_ENV: "test",
  PORT: "3000",
  MONGODB_URI: "mongodb://localhost:27017/nhuu-chat?replicaSet=rs0",
  REDIS_URL: "redis://localhost:6379",
  JWT_SECRET: "a-jwt-secret-that-is-at-least-32-characters",
  ENCRYPTION_KEY: "an-encryption-key-that-is-32-characters",
  TELEGRAM_BOT_TOKEN: "123456789:test-token",
  TELEGRAM_WEBHOOK_SECRET: "a-telegram-webhook-secret"
};

async function importEnv(overrides: Record<string, string> = {}) {
  vi.resetModules();

  for (const [name, value] of Object.entries({ ...validEnvironment, ...overrides })) {
    vi.stubEnv(name, value);
  }

  return import("./env.js");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("environment configuration", () => {
  it("parses a complete environment into typed values", async () => {
    const { env } = await importEnv();

    expect(env).toEqual({ ...validEnvironment, PORT: 3000 });
  });

  it("rejects missing Telegram configuration", async () => {
    await expect(importEnv({ TELEGRAM_BOT_TOKEN: "" })).rejects.toThrow(
      /TELEGRAM_BOT_TOKEN/
    );
  });
});
