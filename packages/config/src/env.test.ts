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

    expect(env).toEqual({
      ...validEnvironment,
      PORT: 3000,
      GEMINI_CHAT_MODEL: "gemini-3.5-flash-lite"
    });
  });

  it("accepts the supported secure database protocols", async () => {
    const { env } = await importEnv({
      MONGODB_URI: "mongodb+srv://cluster.example.com/nhuu-chat",
      REDIS_URL: "rediss://cache.example.com:6380"
    });

    expect(env.MONGODB_URI).toBe("mongodb+srv://cluster.example.com/nhuu-chat");
    expect(env.REDIS_URL).toBe("rediss://cache.example.com:6380");
  });

  it("accepts optional Gemini configuration", async () => {
    const { env } = await importEnv({
      GEMINI_API_KEY: "gemini-test-key",
      GEMINI_CHAT_MODEL: "gemini-test-model"
    });

    expect(env.GEMINI_API_KEY).toBe("gemini-test-key");
    expect(env.GEMINI_CHAT_MODEL).toBe("gemini-test-model");
  });

  it.each([
    ["NODE_ENV", "staging"],
    ["MONGODB_URI", "mongodb-nope://localhost/nhuu-chat"],
    ["REDIS_URL", "redis-nope://localhost:6379"],
    ["JWT_SECRET", "too-short"],
    ["ENCRYPTION_KEY", "too-short"],
    ["TELEGRAM_BOT_TOKEN", ""],
    ["TELEGRAM_WEBHOOK_SECRET", "too-short"],
    ["PORT", "not-a-port"],
    ["PORT", "0"],
    ["PORT", "65536"]
  ])("rejects invalid %s value %s", async (name, value) => {
    await expect(importEnv({ [name]: value })).rejects.toThrow(
      new RegExp(name)
    );
  });
});
