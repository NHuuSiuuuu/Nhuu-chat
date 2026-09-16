import { createServer } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

import { env } from "@nhuu-chat/config";
import { createClient, type RedisClientType } from "redis";

import { createApp } from "./app.js";
import { hydrateKnowledgeVectorStore } from "./ai/knowledge-runtime.js";
import { connectDatabase, disconnectDatabase } from "./db/mongoose.js";
import { closeRealtimeServer, createRealtimeServer } from "./realtime/socket.js";
import { restoreActivePersonalClients } from "./services/telegram-personal.service.js";
import {
  restoreActiveZaloPersonalClients,
  setZaloPersonalRedisLock,
  shutdownActiveZaloPersonalClients,
  type ZaloPersonalRedisLock
} from "./services/zalo-personal.service.js";

import type { Server as HttpServer } from "node:http";

const STARTUP_RESTORE_TIMEOUT_MS = 5_000;

export interface ServerDependencies {
  connectDatabase?: (uri: string) => Promise<void>;
  hydrateKnowledge?: () => Promise<void>;
  restorePersonalClients?: () => Promise<void>;
  restoreZaloPersonalClients?: () => Promise<void>;
  shutdownZaloPersonalClients?: () => Promise<void>;
  setupZaloPersonalRedisLock?: () => Promise<() => Promise<void>>;
  disconnectDatabase?: () => Promise<void>;
  listen?: (server: HttpServer, port: number) => Promise<void>;
}

export interface ServerHandle {
  shutdown: () => Promise<void>;
}

function listenHttpServer(server: HttpServer, port: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const onStartupError = (error: Error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onStartupError);
      resolve();
    };

    server.once("error", onStartupError);
    server.once("listening", onListening);
    server.listen(port);
  });
}

// Redis SET NX PX giữ một lease ngắn; chỉ token đã tạo lease mới được phép xóa nó.
function createZaloPersonalRedisLock(client: RedisClientType): ZaloPersonalRedisLock {
  return {
    async acquire(key, ttlMs) {
      const token = randomUUID();
      try {
        const acquired = await client.set(key, token, { NX: true, PX: ttlMs });
        if (acquired !== "OK") return undefined;
        return {
          async release() {
            await client.eval(
              "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end",
              { keys: [key], arguments: [token] }
            ).catch(() => undefined);
          },
          async renew() {
            const renewed = await client.eval(
              "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('PEXPIRE', KEYS[1], ARGV[2]) else return 0 end",
              { keys: [key], arguments: [token, String(ttlMs)] }
            );
            return Number(renewed) === 1;
          }
        };
      } catch {
        return undefined;
      }
    }
  };
}

// Bootstrap chỉ bật distributed lock sau khi Redis xác nhận kết nối; lỗi kết nối vẫn fail-closed cho connector.
async function setupZaloPersonalRedisLock(): Promise<() => Promise<void>> {
  if (!process.env.REDIS_URL) {
    setZaloPersonalRedisLock(undefined);
    return async () => undefined;
  }

  const client = createClient({
    url: process.env.REDIS_URL,
    socket: { reconnectStrategy: false },
    disableOfflineQueue: true
  });
  client.on("error", () => undefined);
  try {
    await client.connect();
    setZaloPersonalRedisLock(createZaloPersonalRedisLock(client));
  } catch {
    setZaloPersonalRedisLock({ acquire: async () => undefined });
  }

  return async () => {
    setZaloPersonalRedisLock(undefined);
    if (client.isOpen) await client.quit().catch(() => undefined);
  };
}

// Giới hạn thời gian restore để một connector chậm không chặn health check và toàn bộ API.
async function restoreWithStartupDeadline(restore: () => Promise<void>, label: string): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const restoreTask = restore().catch((error: unknown) => {
    console.error(`${label} restore failed`, error instanceof Error ? error.message : "unknown error");
  });
  try {
    await Promise.race([
      restoreTask,
      new Promise<void>((resolve) => {
        timeout = setTimeout(() => {
          timedOut = true;
          resolve();
        }, STARTUP_RESTORE_TIMEOUT_MS);
        timeout.unref?.();
      })
    ]);
    if (timedOut) console.error(`${label} restore timed out; API will continue starting`);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function startServer(dependencies: ServerDependencies = {}): Promise<ServerHandle> {
  const connect = dependencies.connectDatabase ?? connectDatabase;
  const hydrateKnowledge = dependencies.hydrateKnowledge ?? hydrateKnowledgeVectorStore;
  const restore = dependencies.restorePersonalClients ?? restoreActivePersonalClients;
  const restoreZalo = dependencies.restoreZaloPersonalClients ?? restoreActiveZaloPersonalClients;
  const shutdownZalo = dependencies.shutdownZaloPersonalClients ?? shutdownActiveZaloPersonalClients;
  const setupRedisLock = dependencies.setupZaloPersonalRedisLock ?? setupZaloPersonalRedisLock;
  const disconnect = dependencies.disconnectDatabase ?? disconnectDatabase;
  await connect(env.MONGODB_URI);
  let closeRedisLock: (() => Promise<void>) | undefined;
  try {
    await hydrateKnowledge();
    closeRedisLock = await setupRedisLock();
    await restoreWithStartupDeadline(restore, "Telegram personal");
    await restoreWithStartupDeadline(restoreZalo, "Zalo personal");
  } catch (error) {
    // Restore có thể đã tạo connector trước khi owner khác lỗi; dọn connector trước hạ tầng chung.
    await shutdownZalo().catch(() => undefined);
    await closeRedisLock?.().catch(() => undefined);
    await disconnect().catch(() => undefined);
    throw error;
  }
  const httpServer = createServer(createApp());

  const socketServer = createRealtimeServer(httpServer);

  const shutdown = async () => {
    // Listener Zalo phải dừng trước khi đóng Redis lease và database.
    await shutdownZalo();
    socketServer.close();
    await closeRealtimeServer(socketServer);
    await closeRedisLock?.();
    await new Promise<void>((resolve) => {
      if (!httpServer.listening) {
        resolve();
        return;
      }
      httpServer.close(() => resolve());
    });
    await disconnect();
  };

  try {
    await (dependencies.listen ?? listenHttpServer)(httpServer, env.PORT);
  } catch (error) {
    await shutdown();
    throw error;
  }

  if (!dependencies.listen) {
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
    httpServer.on("error", (error) => {
      console.error("HTTP server runtime error", error);
      process.exitCode = 1;
      void shutdown();
    });
  }

  return { shutdown };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  void startServer().catch((error) => {
    console.error("Failed to start HTTP server", error);
    process.exitCode = 1;
  });
}
