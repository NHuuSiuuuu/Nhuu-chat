import type { RedisClientType } from "redis";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RedisFacebookOAuthStore } from "./facebook-oauth.store.js";

type FakeRedis = {
  isOpen: boolean;
  values: Map<string, string>;
  on: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  getDel: ReturnType<typeof vi.fn>;
  quit: ReturnType<typeof vi.fn>;
};

function fakeRedis(): FakeRedis {
  const client: FakeRedis = {
    isOpen: false,
    values: new Map(),
    on: vi.fn(),
    connect: vi.fn(async () => {
      client.isOpen = true;
    }),
    set: vi.fn(async (key: string, value: string) => {
      client.values.set(key, value);
      return "OK";
    }),
    getDel: vi.fn(async (key: string) => {
      const value = client.values.get(key);
      client.values.delete(key);
      return value;
    }),
    quit: vi.fn(async () => {
      client.isOpen = false;
      return "OK";
    })
  };
  return client;
}

describe("RedisFacebookOAuthStore", () => {
  afterEach(() => vi.unstubAllEnvs());

  beforeEach(() => {
    vi.stubEnv("ENCRYPTION_KEY", "an-encryption-key-that-is-32-characters");
  });

  it("encrypts state at rest and decrypts it on a one-time consume", async () => {
    const redis = fakeRedis();
    const store = new RedisFacebookOAuthStore(redis as unknown as RedisClientType);
    const value = { kind: "oauth" as const, userId: "user-1" };

    await store.save("state-token", value, 600);

    expect(redis.connect).toHaveBeenCalledOnce();
    expect(redis.set).toHaveBeenCalledWith(
      "nhuu-chat:facebook-oauth:state-token",
      expect.stringMatching(/^v1\./),
      { EX: 600 }
    );
    expect(redis.values.get("nhuu-chat:facebook-oauth:state-token")).not.toContain(JSON.stringify(value));
    await expect(store.consume("state-token")).resolves.toEqual(value);
    await expect(store.consume("state-token")).resolves.toBeUndefined();
    expect(redis.getDel).toHaveBeenCalledTimes(2);
  });

  it("discards malformed encrypted state instead of returning it", async () => {
    const redis = fakeRedis();
    redis.isOpen = true;
    redis.values.set("nhuu-chat:facebook-oauth:broken", "not-encrypted-json");
    const store = new RedisFacebookOAuthStore(redis as unknown as RedisClientType);

    await expect(store.consume("broken")).resolves.toBeUndefined();
  });
});
