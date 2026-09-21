import { createClient, type RedisClientType } from "redis";

import { decryptSecret, encryptSecret } from "../common/crypto.js";
import type { FacebookOAuthStore, FacebookOAuthStoredValue } from "./facebook-oauth.service.js";

const KEY_PREFIX = "nhuu-chat:facebook-oauth:";

export class RedisFacebookOAuthStore implements FacebookOAuthStore {
  private readonly client: RedisClientType;

  constructor(client?: RedisClientType) {
    this.client = client ?? createClient({ url: process.env.REDIS_URL ?? "redis://localhost:6379" });
    this.client.on("error", () => undefined);
  }

  private async connected(): Promise<RedisClientType> {
    if (!this.client.isOpen) await this.client.connect();
    return this.client;
  }

  async save(token: string, value: FacebookOAuthStoredValue, ttlSeconds: number): Promise<void> {
    const client = await this.connected();
    await client.set(`${KEY_PREFIX}${token}`, encryptSecret(JSON.stringify(value)), { EX: ttlSeconds });
  }

  async consume(token: string): Promise<FacebookOAuthStoredValue | undefined> {
    const client = await this.connected();
    const stored = await client.getDel(`${KEY_PREFIX}${token}`);
    if (!stored) return undefined;
    try {
      return JSON.parse(decryptSecret(stored)) as FacebookOAuthStoredValue;
    } catch {
      return undefined;
    }
  }

  async close(): Promise<void> {
    if (this.client.isOpen) await this.client.quit().catch(() => undefined);
  }
}

export const facebookOAuthStore = new RedisFacebookOAuthStore();

export async function closeFacebookOAuthStore(): Promise<void> {
  await facebookOAuthStore.close();
}
