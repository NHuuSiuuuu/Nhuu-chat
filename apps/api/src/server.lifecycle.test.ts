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
      disconnectDatabase: async () => {
        events.push("disconnect");
      },
      listen: async () => {
        events.push("listen");
      }
    });

    expect(events).toEqual(["connect", "listen"]);
    await handle.shutdown();
    expect(events).toEqual(["connect", "listen", "disconnect"]);
  });

  it("disconnects when listen fails after database connection", async () => {
    const disconnectDatabase = vi.fn(async () => undefined);

    await expect(
      startServer({
        connectDatabase: async () => undefined,
        disconnectDatabase,
        listen: async () => {
          throw new Error("port is unavailable");
        }
      })
    ).rejects.toThrow("port is unavailable");

    expect(disconnectDatabase).toHaveBeenCalledOnce();
  });
});
