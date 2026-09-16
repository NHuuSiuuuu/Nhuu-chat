import { describe, expect, it, vi } from "vitest";

process.env.NODE_ENV ??= "test";
process.env.MONGODB_URI ??= "mongodb://127.0.0.1:27017/nhuu-chat-test?replicaSet=rs0";
process.env.REDIS_URL ??= "redis://127.0.0.1:6379";
process.env.JWT_SECRET ??= "test-jwt-secret-that-is-at-least-32-characters";
process.env.ENCRYPTION_KEY ??= "test-encryption-key-that-is-at-least-32-characters";
process.env.TELEGRAM_BOT_TOKEN ??= "test-telegram-token";
process.env.TELEGRAM_WEBHOOK_SECRET ??= "test-telegram-webhook-secret";

const { startServer } = await import("./server.js");

describe("production server bootstrap", () => {
  it("connects before listen and disconnects during shutdown", async () => {
    const events: string[] = [];
    const handle = await startServer({
      connectDatabase: async () => {
        events.push("connect");
      },
      hydrateKnowledge: async () => {
        events.push("hydrate-knowledge");
      },
      setupZaloPersonalRedisLock: async () => {
        events.push("setup-zalo-personal-redis-lock");
        return async () => {
          events.push("close-zalo-personal-redis-lock");
        };
      },
      restorePersonalClients: async () => {
        events.push("restore-personal-sessions");
      },
      restoreZaloPersonalClients: async () => {
        events.push("restore-zalo-personal-sessions");
      },
      shutdownZaloPersonalClients: async () => {
        events.push("shutdown-zalo-personal-sessions");
      },
      disconnectDatabase: async () => {
        events.push("disconnect");
      },
      listen: async () => {
        events.push("listen");
      }
    });

    expect(events).toEqual([
      "connect", "hydrate-knowledge", "setup-zalo-personal-redis-lock", "restore-personal-sessions",
      "restore-zalo-personal-sessions", "listen"
    ]);
    await handle.shutdown();
    expect(events).toEqual([
      "connect", "hydrate-knowledge", "setup-zalo-personal-redis-lock", "restore-personal-sessions",
      "restore-zalo-personal-sessions", "listen", "shutdown-zalo-personal-sessions",
      "close-zalo-personal-redis-lock", "disconnect"
    ]);
  });

  it("disconnects when listen fails after database connection", async () => {
    const disconnectDatabase = vi.fn(async () => undefined);

    await expect(
      startServer({
        connectDatabase: async () => undefined,
        hydrateKnowledge: async () => undefined,
        restorePersonalClients: async () => undefined,
        restoreZaloPersonalClients: async () => undefined,
        shutdownZaloPersonalClients: async () => undefined,
        disconnectDatabase,
        listen: async () => {
          throw new Error("port is unavailable");
        }
      })
    ).rejects.toThrow("port is unavailable");

    expect(disconnectDatabase).toHaveBeenCalledOnce();
  });

  it("disconnects without restoring or listening when knowledge hydration fails", async () => {
    const failure = new Error("knowledge hydration failed");
    const disconnectDatabase = vi.fn(async () => undefined);
    const restorePersonalClients = vi.fn(async () => undefined);
    const restoreZaloPersonalClients = vi.fn(async () => undefined);
    const listen = vi.fn(async () => undefined);

    await expect(startServer({
      connectDatabase: async () => undefined,
      hydrateKnowledge: async () => {
        throw failure;
      },
      restorePersonalClients,
      restoreZaloPersonalClients,
      disconnectDatabase,
      listen
    })).rejects.toBe(failure);

    expect(disconnectDatabase).toHaveBeenCalledOnce();
    expect(restorePersonalClients).not.toHaveBeenCalled();
    expect(restoreZaloPersonalClients).not.toHaveBeenCalled();
    expect(listen).not.toHaveBeenCalled();
  });

  it("preserves the hydration failure when disconnect cleanup also fails", async () => {
    const hydrationFailure = new Error("knowledge hydration failed");
    const disconnectFailure = new Error("database disconnect failed");
    const disconnectDatabase = vi.fn(async () => {
      throw disconnectFailure;
    });
    const restorePersonalClients = vi.fn(async () => undefined);
    const restoreZaloPersonalClients = vi.fn(async () => undefined);
    const listen = vi.fn(async () => undefined);

    await expect(startServer({
      connectDatabase: async () => undefined,
      hydrateKnowledge: async () => {
        throw hydrationFailure;
      },
      restorePersonalClients,
      restoreZaloPersonalClients,
      disconnectDatabase,
      listen
    })).rejects.toBe(hydrationFailure);

    expect(disconnectDatabase).toHaveBeenCalledOnce();
    expect(restorePersonalClients).not.toHaveBeenCalled();
    expect(restoreZaloPersonalClients).not.toHaveBeenCalled();
    expect(listen).not.toHaveBeenCalled();
  });

  it("opens the API when a personal-session restore exceeds the startup deadline", async () => {
    vi.useFakeTimers();
    const listen = vi.fn(async () => undefined);
    const restorePersonalClients = vi.fn(() => new Promise<void>(() => undefined));
    const handlePromise = startServer({
      connectDatabase: async () => undefined,
      hydrateKnowledge: async () => undefined,
      setupZaloPersonalRedisLock: async () => async () => undefined,
      restorePersonalClients,
      restoreZaloPersonalClients: async () => undefined,
      shutdownZaloPersonalClients: async () => undefined,
      disconnectDatabase: async () => undefined,
      listen
    });

    await vi.advanceTimersByTimeAsync(5_000);
    const handle = await handlePromise;

    expect(restorePersonalClients).toHaveBeenCalledOnce();
    expect(listen).toHaveBeenCalledOnce();
    await handle.shutdown();
    vi.useRealTimers();
  });
});
