import { createClient, type RedisClientType } from "redis";

import { decryptSecret, encryptSecret } from "../common/crypto.js";
import { AppError } from "../common/errors.js";
import type { InstagramOAuthStateStore } from "./instagram-oauth.service.js";

const KEY_PREFIX = "nhuu-chat:instagram-oauth:";

export class RedisInstagramOAuthStore implements InstagramOAuthStateStore {
  private readonly client: RedisClientType;

  constructor(client?: RedisClientType) {
    this.client = client ?? createClient({
      url: process.env.REDIS_URL ?? "redis://localhost:6379",
      socket: { connectTimeout: 2_000, reconnectStrategy: false },
      disableOfflineQueue: true
    });
    this.client.on("error", () => undefined);
  }

  private async ready(): Promise<RedisClientType> {
    try {
      if (!this.client.isReady) await this.client.connect();
      return this.client;
    } catch {
      throw new AppError(503, "INSTAGRAM_OAUTH_STORE_UNAVAILABLE", "Instagram OAuth is temporarily unavailable");
    }
  }

  async save(state: string, value: { userId: string }, ttlSeconds: number): Promise<void> {
    try {
      const client = await this.ready();
      await client.set(`${KEY_PREFIX}${state}`, encryptSecret(JSON.stringify(value)), { EX: ttlSeconds });
    } catch {
      throw new AppError(503, "INSTAGRAM_OAUTH_STORE_UNAVAILABLE", "Instagram OAuth is temporarily unavailable");
    }
  }

  // GETDEL bảo đảm callback chỉ sử dụng state một lần, kể cả khi chạy đồng thời.
  async consume(state: string): Promise<{ userId: string } | undefined> {
    try {
      const client = await this.ready();
      const stored = await client.getDel(`${KEY_PREFIX}${state}`);
      if (!stored) return undefined;
      const value: unknown = JSON.parse(decryptSecret(stored));
      if (!value || typeof value !== "object" || typeof (value as { userId?: unknown }).userId !== "string") return undefined;
      return value as { userId: string };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(503, "INSTAGRAM_OAUTH_STORE_UNAVAILABLE", "Instagram OAuth is temporarily unavailable");
    }
  }
}

export const instagramOAuthStore = new RedisInstagramOAuthStore();
