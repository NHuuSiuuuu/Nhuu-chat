import type { RedisClientType } from "redis";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RedisFacebookOAuthStore } from "./facebook-oauth.store.js";

type FakeRedis = {
  isOpen: boolean;
  isReady: boolean;
  values: Map<string, string>;
  on: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  getDel: ReturnType<typeof vi.fn>;
  eval: ReturnType<typeof vi.fn>;
  quit: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
};

function fakeRedis(): FakeRedis {
  const client: FakeRedis = {
    isOpen: false,
    isReady: false,
    values: new Map(),
    on: vi.fn(),
    connect: vi.fn(async () => {
      client.isOpen = true;
      client.isReady = true;
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
      client.isReady = false;
      return "OK";
    }),
    destroy: vi.fn(() => {
      client.isOpen = false;
      client.isReady = false;
    })
  };
  return client;
}

async function settleWithin<T>(promise: Promise<T>, timeoutMs = 100): Promise<
  | { status: "resolved"; value: T }
  | { status: "rejected"; error: unknown }
  | { status: "pending" }
> {
  return Promise.race([
    promise.then(
      (value) => ({ status: "resolved" as const, value }),
      (error: unknown) => ({ status: "rejected" as const, error })
    ),
    new Promise<{ status: "pending" }>((resolve) => {
      setTimeout(() => resolve({ status: "pending" }), timeoutMs);
    })
  ]);
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
    redis.isReady = true;
    redis.values.set("nhuu-chat:facebook-oauth:broken", "not-encrypted-json");
    const store = new RedisFacebookOAuthStore(redis as unknown as RedisClientType);

    await expect(store.consume("broken")).resolves.toBeUndefined();
  });

  it.each([
    ["connect", (store: RedisFacebookOAuthStore) => store.read("state-token")],
    ["set", (store: RedisFacebookOAuthStore) => store.save("state-token", { kind: "oauth", userId: "user-1" }, 600)],
    ["get", (store: RedisFacebookOAuthStore) => store.read("state-token")],
    ["getDel", (store: RedisFacebookOAuthStore) => store.consume("state-token")],
    ["eval", (store: RedisFacebookOAuthStore) => store.claim("selection-token", "claim-1", 600)]
  ])("bounds a stalled Redis %s and returns a sanitized finite error", async (method, invoke) => {
    const redis = fakeRedis();
    if (method !== "connect") {
      redis.isOpen = true;
      redis.isReady = true;
    }
    redis[method as "connect" | "set" | "get" | "getDel" | "eval"].mockImplementation(
      () => new Promise(() => undefined)
    );
    const store = new RedisFacebookOAuthStore(redis as unknown as RedisClientType, {
      operationTimeoutMs: 5
    });

    const result = await settleWithin(invoke(store));

    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.error).toMatchObject({
      name: "AppError",
      statusCode: 503,
      code: "FACEBOOK_OAUTH_STORE_UNAVAILABLE",
      message: "Facebook OAuth is temporarily unavailable"
    });
  });

  it("sanitizes Redis failures instead of exposing connection details", async () => {
    const redis = fakeRedis();
    redis.isOpen = true;
    redis.isReady = true;
    redis.get.mockRejectedValue(new Error("connect ECONNREFUSED redis://user:secret@redis.internal:6379"));
    const store = new RedisFacebookOAuthStore(redis as unknown as RedisClientType, {
      operationTimeoutMs: 5
    });

    await expect(store.read("state-token")).rejects.toMatchObject({
      statusCode: 503,
      code: "FACEBOOK_OAUTH_STORE_UNAVAILABLE",
      message: "Facebook OAuth is temporarily unavailable"
    });
  });

  it("destroys an open but unready Redis client without waiting for QUIT", async () => {
    const redis = fakeRedis();
    redis.isOpen = true;
    redis.quit.mockImplementation(() => new Promise(() => undefined));
    const store = new RedisFacebookOAuthStore(redis as unknown as RedisClientType, {
      shutdownTimeoutMs: 5
    });

    await expect(settleWithin(store.close())).resolves.toMatchObject({ status: "resolved" });
    expect(redis.quit).not.toHaveBeenCalled();
    expect(redis.destroy).toHaveBeenCalledOnce();
  });

  it("forces Redis destruction when graceful QUIT exceeds the shutdown deadline", async () => {
    const redis = fakeRedis();
    redis.isOpen = true;
    redis.isReady = true;
    redis.quit.mockImplementation(() => new Promise(() => undefined));
    const store = new RedisFacebookOAuthStore(redis as unknown as RedisClientType, {
      shutdownTimeoutMs: 5
    });

    await expect(settleWithin(store.close())).resolves.toMatchObject({ status: "resolved" });
    expect(redis.quit).toHaveBeenCalledOnce();
    expect(redis.destroy).toHaveBeenCalledOnce();
  });

  it("forces Redis destruction when graceful QUIT fails", async () => {
    const redis = fakeRedis();
    redis.isOpen = true;
    redis.isReady = true;
    redis.quit.mockRejectedValue(new Error("socket closed"));
    const store = new RedisFacebookOAuthStore(redis as unknown as RedisClientType, {
      shutdownTimeoutMs: 5
    });

    await expect(store.close()).resolves.toBeUndefined();
    expect(redis.destroy).toHaveBeenCalledOnce();
  });
});
