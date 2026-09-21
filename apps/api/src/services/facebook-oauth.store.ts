import { createClient, type RedisClientType } from "redis";

import { decryptSecret, encryptSecret } from "../common/crypto.js";
import { AppError } from "../common/errors.js";
import type { FacebookOAuthStore, FacebookOAuthStoredValue } from "./facebook-oauth.service.js";

const KEY_PREFIX = "nhuu-chat:facebook-oauth:";
const CLAIM_KEY_SUFFIX = ":claim";
const REDIS_OPERATION_TIMEOUT_MS = 2_000;
const REDIS_SHUTDOWN_TIMEOUT_MS = 1_000;
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

interface RedisFacebookOAuthStoreOptions {
  operationTimeoutMs?: number;
  shutdownTimeoutMs?: number;
}

function withDeadline<T>(operation: () => Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new Error("Redis operation timed out")), timeoutMs);
    timeout.unref?.();
  });

  return Promise.race([Promise.resolve().then(operation), deadline]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}

export class RedisFacebookOAuthStore implements FacebookOAuthStore {
  private readonly client: RedisClientType;
  private readonly operationTimeoutMs: number;
  private readonly shutdownTimeoutMs: number;
  private connectAttempt: Promise<void> | undefined;

  constructor(client?: RedisClientType, options: RedisFacebookOAuthStoreOptions = {}) {
    this.operationTimeoutMs = options.operationTimeoutMs ?? REDIS_OPERATION_TIMEOUT_MS;
    this.shutdownTimeoutMs = options.shutdownTimeoutMs ?? REDIS_SHUTDOWN_TIMEOUT_MS;
    this.client = client ?? createClient({
      url: process.env.REDIS_URL ?? "redis://localhost:6379",
      socket: {
        connectTimeout: this.operationTimeoutMs,
        reconnectStrategy: false
      },
      disableOfflineQueue: true
    });
    this.client.on("error", () => undefined);
  }

  // Chuẩn hóa mọi lỗi Redis để request kết thúc hữu hạn mà không lộ chi tiết hạ tầng.
  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await withDeadline(operation, this.operationTimeoutMs);
    } catch {
      throw new AppError(
        503,
        "FACEBOOK_OAUTH_STORE_UNAVAILABLE",
        "Facebook OAuth is temporarily unavailable"
      );
    }
  }

  // Đóng client đang mở để hủy socket và giải phóng mọi lệnh Redis còn chờ.
  private destroyOpenClient(): void {
    if (!this.client.isOpen) return;
    try {
      this.client.destroy();
    } catch {
      // Client có thể vừa được socket error đóng giữa lúc kiểm tra và destroy.
    }
  }

  // Dùng chung một lần connect và reset client nếu connect/handshake vượt deadline.
  private connect(): Promise<void> {
    if (this.connectAttempt) return this.connectAttempt;

    if (this.client.isOpen) this.destroyOpenClient();
    const attempt = this.execute(() => this.client.connect())
      .then(() => undefined)
      .catch((error: unknown) => {
        this.destroyOpenClient();
        throw error;
      })
      .finally(() => {
        if (this.connectAttempt === attempt) this.connectAttempt = undefined;
      });
    this.connectAttempt = attempt;
    return attempt;
  }

  private async connected(): Promise<RedisClientType> {
    if (!this.client.isReady) {
      await this.connect();
    }
    return this.client;
  }

  async save(token: string, value: FacebookOAuthStoredValue, ttlSeconds: number): Promise<void> {
    const client = await this.connected();
    await this.execute(() => client.set(
      `${KEY_PREFIX}${token}`,
      encryptSecret(JSON.stringify(value)),
      { EX: ttlSeconds }
    ));
  }

  async read(token: string): Promise<FacebookOAuthStoredValue | undefined> {
    const client = await this.connected();
    return parseStoredValue(await this.execute(() => client.get(`${KEY_PREFIX}${token}`)));
  }

  async consume(token: string): Promise<FacebookOAuthStoredValue | undefined> {
    const client = await this.connected();
    return parseStoredValue(await this.execute(() => client.getDel(`${KEY_PREFIX}${token}`)));
  }

  // Claim và đọc selection trong cùng một lệnh Redis để chặn hai persistence chạy đồng thời.
  async claim(token: string, claimToken: string, ttlSeconds: number): Promise<FacebookOAuthStoredValue | undefined> {
    const client = await this.connected();
    const key = `${KEY_PREFIX}${token}`;
    return parseStoredValue(await this.execute(() => client.eval(CLAIM_SCRIPT, {
      keys: [key, `${key}${CLAIM_KEY_SUFFIX}`],
      arguments: [claimToken, String(ttlSeconds)]
    })));
  }

  async releaseClaim(token: string, claimToken: string): Promise<void> {
    const client = await this.connected();
    await this.execute(() => client.eval(RELEASE_CLAIM_SCRIPT, {
      keys: [`${KEY_PREFIX}${token}${CLAIM_KEY_SUFFIX}`],
      arguments: [claimToken]
    }));
  }

  // Chỉ request đang giữ claim mới được consume selection và xóa lease.
  async consumeClaim(token: string, claimToken: string): Promise<FacebookOAuthStoredValue | undefined> {
    const client = await this.connected();
    const key = `${KEY_PREFIX}${token}`;
    return parseStoredValue(await this.execute(() => client.eval(CONSUME_CLAIM_SCRIPT, {
      keys: [key, `${key}${CLAIM_KEY_SUFFIX}`],
      arguments: [claimToken]
    })));
  }

  // Shutdown ưu tiên QUIT hữu hạn; client đang reconnect hoặc bị treo sẽ bị đóng cưỡng bức.
  async close(): Promise<void> {
    if (!this.client.isOpen) return;
    if (!this.client.isReady) {
      this.destroyOpenClient();
      return;
    }

    try {
      await withDeadline(() => this.client.sendCommand(["QUIT"]), this.shutdownTimeoutMs);
    } catch {
      // Shutdown vẫn tiếp tục bằng force-close khi QUIT lỗi hoặc vượt deadline.
    } finally {
      this.destroyOpenClient();
    }
  }
}

export const facebookOAuthStore = new RedisFacebookOAuthStore();

export async function closeFacebookOAuthStore(): Promise<void> {
  await facebookOAuthStore.close();
}
