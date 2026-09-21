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
  private readonly connectAbortController: AbortController | undefined;
  private readonly operationTimeoutMs: number;
  private readonly shutdownTimeoutMs: number;
  private connectAttempt: Promise<void> | undefined;
  private closeAttempt: Promise<void> | undefined;
  private activeConnects = 0;
  private isClosing = false;

  constructor(client?: RedisClientType, options: RedisFacebookOAuthStoreOptions = {}) {
    this.operationTimeoutMs = options.operationTimeoutMs ?? REDIS_OPERATION_TIMEOUT_MS;
    this.shutdownTimeoutMs = options.shutdownTimeoutMs ?? REDIS_SHUTDOWN_TIMEOUT_MS;
    this.connectAbortController = client ? undefined : new AbortController();
    this.client = client ?? createClient({
      url: process.env.REDIS_URL ?? "redis://localhost:6379",
      socket: {
        connectTimeout: this.operationTimeoutMs,
        reconnectStrategy: false,
        signal: this.connectAbortController?.signal
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

  private unavailableError(): AppError {
    return new AppError(
      503,
      "FACEBOOK_OAUTH_STORE_UNAVAILABLE",
      "Facebook OAuth is temporarily unavailable"
    );
  }

  private ensureNotClosing(): void {
    if (this.isClosing) throw this.unavailableError();
  }

  // Gọi API public kể cả khi trạng thái đang đổi để không bỏ lỡ socket vừa mở.
  private destroyClient(): void {
    try {
      this.client.destroy();
    } catch {
      // Client đã đóng trước khi destroy được thực thi.
    }
  }

  // Dùng chung một lần connect và reset client nếu connect/handshake vượt deadline.
  private connect(): Promise<void> {
    if (this.connectAttempt) return this.connectAttempt;
    if (this.isClosing) return Promise.reject(this.unavailableError());

    if (this.client.isOpen) this.destroyClient();
    let invalidated = false;
    this.activeConnects += 1;
    const rawConnect = Promise.resolve()
      .then(() => {
        this.ensureNotClosing();
        return this.client.connect();
      })
      .finally(() => {
        this.activeConnects -= 1;
        if (invalidated || this.isClosing) this.destroyClient();
      });
    const attempt = this.execute(async () => {
      await rawConnect;
      this.ensureNotClosing();
    })
      .then(() => undefined)
      .catch((error: unknown) => {
        invalidated = true;
        this.destroyClient();
        throw error;
      })
      .finally(() => {
        if (this.connectAttempt === attempt) this.connectAttempt = undefined;
      });
    this.connectAttempt = attempt;
    return attempt;
  }

  private async connected(): Promise<RedisClientType> {
    this.ensureNotClosing();
    if (!this.client.isReady) {
      await this.connect();
    }
    this.ensureNotClosing();
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

  // Chờ connect đang chạy và ưu tiên QUIT trong cùng deadline trước khi đóng cưỡng bức.
  private async closeClient(): Promise<void> {
    try {
      await withDeadline(async () => {
        await this.connectAttempt?.catch(() => undefined);
        if (!this.client.isOpen || !this.client.isReady) return;
        await this.client.sendCommand(["QUIT"]);
      }, this.shutdownTimeoutMs);
    } catch {
      // Shutdown vẫn tiếp tục bằng force-close khi connect/QUIT lỗi hoặc vượt deadline.
    } finally {
      this.destroyClient();
    }
  }

  // Đặt barrier đồng bộ để connect đã lên lịch không thể mở socket sau khi shutdown bắt đầu.
  close(): Promise<void> {
    if (this.closeAttempt) return this.closeAttempt;
    this.isClosing = true;
    if (this.activeConnects > 0) {
      this.connectAbortController?.abort();
      this.destroyClient();
    }
    this.closeAttempt = this.closeClient();
    return this.closeAttempt;
  }
}

export const facebookOAuthStore = new RedisFacebookOAuthStore();

export async function closeFacebookOAuthStore(): Promise<void> {
  await facebookOAuthStore.close();
}
