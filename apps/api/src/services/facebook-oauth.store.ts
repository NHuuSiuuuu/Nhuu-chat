import { createClient, type RedisClientType } from "redis";

import { decryptSecret, encryptSecret } from "../common/crypto.js";
import type { FacebookOAuthStore, FacebookOAuthStoredValue } from "./facebook-oauth.service.js";

const KEY_PREFIX = "nhuu-chat:facebook-oauth:";
const CLAIM_KEY_SUFFIX = ":claim";
const CLAIM_SCRIPT = `
local value = redis.call('GET', KEYS[1])
if not value then return false end
local claimed = redis.call('SET', KEYS[2], ARGV[1], 'NX', 'EX', ARGV[2])
if not claimed then return false end
return value
`;
const RELEASE_CLAIM_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;
const CONSUME_CLAIM_SCRIPT = `
if redis.call('GET', KEYS[2]) ~= ARGV[1] then return false end
local value = redis.call('GETDEL', KEYS[1])
redis.call('DEL', KEYS[2])
return value
`;

function parseStoredValue(stored: unknown): FacebookOAuthStoredValue | undefined {
  if (typeof stored !== "string" || !stored) return undefined;
  try {
    return JSON.parse(decryptSecret(stored)) as FacebookOAuthStoredValue;
  } catch {
    return undefined;
  }
}

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

  async read(token: string): Promise<FacebookOAuthStoredValue | undefined> {
    const client = await this.connected();
    return parseStoredValue(await client.get(`${KEY_PREFIX}${token}`));
  }

  async consume(token: string): Promise<FacebookOAuthStoredValue | undefined> {
    const client = await this.connected();
    return parseStoredValue(await client.getDel(`${KEY_PREFIX}${token}`));
  }

  // Claim và đọc selection trong cùng một lệnh Redis để chặn hai persistence chạy đồng thời.
  async claim(token: string, claimToken: string, ttlSeconds: number): Promise<FacebookOAuthStoredValue | undefined> {
    const client = await this.connected();
    const key = `${KEY_PREFIX}${token}`;
    return parseStoredValue(await client.eval(CLAIM_SCRIPT, {
      keys: [key, `${key}${CLAIM_KEY_SUFFIX}`],
      arguments: [claimToken, String(ttlSeconds)]
    }));
  }

  async releaseClaim(token: string, claimToken: string): Promise<void> {
    const client = await this.connected();
    await client.eval(RELEASE_CLAIM_SCRIPT, {
      keys: [`${KEY_PREFIX}${token}${CLAIM_KEY_SUFFIX}`],
      arguments: [claimToken]
    });
  }

  // Chỉ request đang giữ claim mới được consume selection và xóa lease.
  async consumeClaim(token: string, claimToken: string): Promise<FacebookOAuthStoredValue | undefined> {
    const client = await this.connected();
    const key = `${KEY_PREFIX}${token}`;
    return parseStoredValue(await client.eval(CONSUME_CLAIM_SCRIPT, {
      keys: [key, `${key}${CLAIM_KEY_SUFFIX}`],
      arguments: [claimToken]
    }));
  }

  async close(): Promise<void> {
    if (this.client.isOpen) await this.client.quit().catch(() => undefined);
  }
}

export const facebookOAuthStore = new RedisFacebookOAuthStore();

export async function closeFacebookOAuthStore(): Promise<void> {
  await facebookOAuthStore.close();
}
