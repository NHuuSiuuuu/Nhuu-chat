import type { RedisClientType } from "redis";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RedisFacebookOAuthStore } from "./facebook-oauth.store.js";

type FakeRedis = {
  isOpen: boolean;
  values: Map<string, string>;
  on: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  getDel: ReturnType<typeof vi.fn>;
  eval: ReturnType<typeof vi.fn>;
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
    get: vi.fn(async (key: string) => client.values.get(key)),
    getDel: vi.fn(async (key: string) => {
      const value = client.values.get(key);
      client.values.delete(key);
      return value;
    }),
    eval: vi.fn(async (script: string, options: { keys: string[]; arguments: string[] }) => {
      const [valueKey, claimKey] = options.keys;
      const [claimToken] = options.arguments;
      if (script.includes("'NX'")) {
        const value = client.values.get(valueKey);
        if (!value || client.values.has(claimKey)) return undefined;
        client.values.set(claimKey, claimToken);
        return value;
      }
      if (script.includes("'GETDEL'")) {
        if (client.values.get(claimKey) !== claimToken) return undefined;
        const value = client.values.get(valueKey);
        client.values.delete(valueKey);
        client.values.delete(claimKey);
        return value;
      }
      if (client.values.get(valueKey) !== claimToken) return 0;
      client.values.delete(valueKey);
      return 1;
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

  it("reads state with GET without writing or refreshing its expiry", async () => {
    const redis = fakeRedis();
    const store = new RedisFacebookOAuthStore(redis as unknown as RedisClientType);
    const value = { kind: "oauth" as const, userId: "user-1" };
    await store.save("state-token", value, 600);
    redis.set.mockClear();

    await expect(store.read("state-token")).resolves.toEqual(value);

    expect(redis.get).toHaveBeenCalledWith("nhuu-chat:facebook-oauth:state-token");
    expect(redis.set).not.toHaveBeenCalled();
    expect(redis.values.has("nhuu-chat:facebook-oauth:state-token")).toBe(true);
  });

  it("atomically claims, releases and consumes a selection by claim token", async () => {
    const redis = fakeRedis();
    const store = new RedisFacebookOAuthStore(redis as unknown as RedisClientType);
    const value = {
      kind: "selection" as const,
      userId: "user-1",
      pages: [{ id: "page-1", name: "Page One", accessToken: "page-token-1", canPublish: true }]
    };
    await store.save("selection-token", value, 600);
    redis.get.mockClear();

    await expect(store.claim("selection-token", "claim-1", 600)).resolves.toEqual(value);
    await expect(store.claim("selection-token", "claim-2", 600)).resolves.toBeUndefined();
    await store.releaseClaim("selection-token", "wrong-claim");
    await expect(store.claim("selection-token", "claim-2", 600)).resolves.toBeUndefined();
    await store.releaseClaim("selection-token", "claim-1");
    await expect(store.claim("selection-token", "claim-2", 600)).resolves.toEqual(value);
    await expect(store.consumeClaim("selection-token", "claim-2")).resolves.toEqual(value);

    expect(redis.get).not.toHaveBeenCalled();
    expect(redis.eval).toHaveBeenNthCalledWith(1, expect.any(String), {
      keys: ["nhuu-chat:facebook-oauth:selection-token", "nhuu-chat:facebook-oauth:selection-token:claim"],
      arguments: ["claim-1", "600"]
    });
    await expect(store.read("selection-token")).resolves.toBeUndefined();
  });

  it("discards malformed encrypted state instead of returning it", async () => {
    const redis = fakeRedis();
    redis.isOpen = true;
    redis.values.set("nhuu-chat:facebook-oauth:broken", "not-encrypted-json");
    const store = new RedisFacebookOAuthStore(redis as unknown as RedisClientType);

    await expect(store.consume("broken")).resolves.toBeUndefined();
  });
});
