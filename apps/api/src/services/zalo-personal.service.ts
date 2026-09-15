import { randomUUID } from "node:crypto";

import { createZaloPersonalClient, type ZaloPersonalApi, type ZaloPersonalClient } from "../channels/zalo-personal/zalo-personal.client.js";
import { ZaloPersonalSessionModel } from "../channels/zalo-personal/zalo-personal.model.js";
import { type ZaloPersonalStatus } from "../channels/zalo-personal/zalo-personal.schemas.js";
import { decryptSecret, encryptSecret } from "../common/crypto.js";
import { AppError } from "../common/errors.js";

const QR_TTL_MS = 100_000;
const LIFECYCLE_LOCK_TTL_MS = 30_000;
const RESTORE_ATTEMPTS = 2;

type PublicStatus = ZaloPersonalStatus["status"];

export type ZaloPersonalQrStatus = ZaloPersonalStatus;

export interface ZaloPersonalRedisLease {
  release(): Promise<void>;
}

// Tách lease Redis khỏi service để hạ tầng phân tán có thể thay thế mà không kéo adapter vào service.
export interface ZaloPersonalRedisLock {
  acquire(key: string, ttlMs: number): Promise<ZaloPersonalRedisLease | undefined>;
}

type PendingZaloPersonalSession = {
  id: string;
  ownerId: string;
  client: ZaloPersonalClient;
  status: PublicStatus;
  qrData?: string;
  expiresAt: Date;
  displayName?: string;
  username?: string;
  zaloUserId?: string;
  errorCode?: string;
  cancelled: boolean;
  loginTask?: Promise<void>;
  api?: ZaloPersonalApi;
  apiStopTask?: Promise<void>;
};

const pendingSessionsByOwner = new Map<string, PendingZaloPersonalSession>();
const activeClientsByOwner = new Map<string, ZaloPersonalApi>();
const runtimeErrorsByOwner = new Map<string, string>();
const ownerLifecycleTails = new Map<string, Promise<void>>();
let redisLock: ZaloPersonalRedisLock | undefined;

// Chỉ cho phép cấu hình khóa phân tán từ bootstrap; không tự suy đoán lock thành công.
export function setZaloPersonalRedisLock(lock: ZaloPersonalRedisLock | undefined): void {
  redisLock = lock;
}

// Tạo QR một lần cho mỗi owner và giữ client runtime ngoài Mongo cho đến khi đăng nhập hoàn tất.
export async function startZaloPersonalQr(userId: string): Promise<ZaloPersonalQrStatus> {
  return runOwnerLifecycle(userId, async () => {
    // Active map vẫn giữ owner khi stop lỗi, nên QR mới không được phép tạo listener cạnh tranh.
    if (activeClientsByOwner.has(userId)) return getZaloPersonalSessionStatus(userId);

    const existing = pendingSessionsByOwner.get(userId);
    if (existing && (existing.status === "expired" || isExpired(existing.expiresAt))) {
      try {
        await disposePendingQr(existing, "expired", "ZALO_PERSONAL_QR_EXPIRED");
        pendingSessionsByOwner.delete(userId);
      } catch {
        existing.status = "error";
        existing.errorCode = "ZALO_PERSONAL_QR_DISPOSE_FAILED";
        throw new AppError(503, "ZALO_PERSONAL_QR_DISPOSE_FAILED", "Zalo personal QR is temporarily unavailable");
      }
    } else if (existing) {
      return toQrStatus(existing);
    }

    const pending: PendingZaloPersonalSession = {
      id: randomUUID(),
      ownerId: userId,
      client: createZaloPersonalClient(),
      status: "waiting_qr",
      expiresAt: new Date(Date.now() + QR_TTL_MS),
      cancelled: false
    };
    pendingSessionsByOwner.set(userId, pending);

    // Adapter chạy nền để callback QR có thể trả về ngay cả khi người dùng chưa quét mã.
    const login = pending.client.loginQR((payload) => {
      if (!isPendingReady(pending)) return;
      pending.qrData = payload.qrData;
      pending.expiresAt = payload.expiresAt;
    });
    pending.loginTask = runQrLogin(pending, login);
    void pending.loginTask;

    return toQrStatus(pending);
  });
}

// Kiểm tra quyền sở hữu trước khi trả status để QR id không thể bị dùng giữa các owner.
export function getZaloPersonalQrStatus(id: string, userId: string): ZaloPersonalQrStatus {
  const pending = pendingSessionsByOwner.get(userId);
  if (!pending || pending.id !== id) {
    throw new AppError(404, "QR_LOGIN_NOT_FOUND", "QR login was not found");
  }
  if (pending.status === "waiting_qr" && isExpired(pending.expiresAt)) {
    pending.status = "expired";
    pending.qrData = undefined;
  }
  return toQrStatus(pending);
}

export async function getZaloPersonalSessionStatus(userId: string): Promise<ZaloPersonalStatus> {
  const runtimeError = runtimeErrorsByOwner.get(userId);
  if (runtimeError) return { id: userId, status: "error", errorCode: runtimeError };

  const pending = pendingSessionsByOwner.get(userId);
  if (pending) return toQrStatus(pending);

  const session = await ZaloPersonalSessionModel.findOne({ ownerId: userId }).lean();
  if (!session) return { id: userId, status: "disconnected" };

  return {
    id: stringValue(session._id) ?? userId,
    status: publicStatus(session.status),
    ...safeAccountMetadata(session)
  };
}

export async function logoutZaloPersonal(userId: string): Promise<void> {
  await runOwnerLifecycle(userId, async () => {
    const pending = pendingSessionsByOwner.get(userId);
    const active = activeClientsByOwner.get(userId);
    try {
      // Khi QR đã connected, active API là nguồn listener duy nhất để không stop hai lần qua adapter.
      if (active) await active.stopListener();
      else if (pending) await disposePendingQr(pending, "error", "ZALO_PERSONAL_QR_CANCELLED");
    } catch {
      await recordLogoutStopFailure(userId, pending);
      throw new AppError(503, "ZALO_PERSONAL_LOGOUT_FAILED", "Zalo personal logout is temporarily unavailable");
    }

    pendingSessionsByOwner.delete(userId);
    activeClientsByOwner.delete(userId);
    runtimeErrorsByOwner.delete(userId);
    await ZaloPersonalSessionModel.deleteOne({ ownerId: userId });
  });
}

export async function getActiveZaloPersonalClient(userId: string): Promise<ZaloPersonalApi | undefined> {
  const active = activeClientsByOwner.get(userId);
  if (active) return active;

  return runOwnerLifecycle(userId, async () => {
    const existing = activeClientsByOwner.get(userId);
    if (existing) return existing;

    const session = await ZaloPersonalSessionModel.findOne({ ownerId: userId, status: "connected" })
      .select("+encryptedCredentials")
      .lean();
    if (!session?.encryptedCredentials) return undefined;

    return restoreZaloPersonalClient(userId, session.encryptedCredentials);
  });
}

// Khôi phục từng owner độc lập; lỗi một session chỉ được lưu mã an toàn và không chặn owner khác.
export async function restoreActiveZaloPersonalClients(): Promise<void> {
  const sessions = await ZaloPersonalSessionModel.find({ status: "connected" })
    .select("+encryptedCredentials")
    .lean();

  await Promise.all(sessions.map(async (session) => {
    const ownerId = stringValue(session.ownerId);
    if (!ownerId || !session.encryptedCredentials) return;
    try {
      await runOwnerLifecycle(ownerId, async () => {
        if (activeClientsByOwner.has(ownerId)) return;
        await restoreZaloPersonalClient(ownerId, session.encryptedCredentials);
      });
    } catch {
      await ZaloPersonalSessionModel.updateOne(
        { ownerId },
        { $set: { status: "error", lastErrorCode: "ZALO_PERSONAL_RESTORE_FAILED" } }
      );
    }
  }));
}

export async function shutdownActiveZaloPersonalClients(): Promise<void> {
  const pending = [...pendingSessionsByOwner.values()];
  pendingSessionsByOwner.clear();
  await Promise.all(pending.map((session) => session.client.disconnect().catch(() => undefined)));

  const active = [...activeClientsByOwner.values()];
  activeClientsByOwner.clear();
  runtimeErrorsByOwner.clear();
  await Promise.all(active.map((client) => client.stopListener().catch(() => undefined)));
}

// Theo dõi native login ngoài queue nhưng đưa completion vào queue sau khi đã kiểm tra cancellation.
async function runQrLogin(pending: PendingZaloPersonalSession, login: Promise<ZaloPersonalApi>): Promise<void> {
  try {
    const api = await login;
    pending.api = api;
    if (!isPendingReady(pending)) {
      await stopPendingApi(pending, api);
      return;
    }
    await runOwnerLifecycle(pending.ownerId, () => completeQrLogin(pending, api));
  } catch {
    if (pending.cancelled) return;
    await runOwnerLifecycle(pending.ownerId, () => recordQrLoginFailure(pending));
  }
}

// Hoàn tất sau loginQR: listener chỉ được đánh dấu active sau khi credential đã mã hóa được ghi thành công.
async function completeQrLogin(pending: PendingZaloPersonalSession, api: ZaloPersonalApi): Promise<void> {
  if (!isPendingReady(pending)) {
    await stopPendingApi(pending, api).catch(() => undefined);
    return;
  }

  const account = await api.getAccountInfo();
  if (!isPendingReady(pending)) {
    await stopPendingApi(pending, api).catch(() => undefined);
    return;
  }
  const zaloUserId = stringValue(account.id);
  const credentials = JSON.stringify(api.getContext().credentials);
  if (!zaloUserId || !credentials) throw new Error("Zalo login response is incomplete");

  if (!isPendingReady(pending)) {
    await stopPendingApi(pending, api).catch(() => undefined);
    return;
  }
  await api.startListener();
  if (!isPendingReady(pending)) {
    await stopPendingApi(pending, api).catch(() => undefined);
    return;
  }
  await ZaloPersonalSessionModel.findOneAndUpdate(
    { ownerId: pending.ownerId },
    {
      $set: {
        ownerId: pending.ownerId,
        encryptedCredentials: encryptSecret(credentials),
        zaloUserId,
        displayName: nullableString(account.displayName),
        username: nullableString(account.username),
        status: "connected",
        qrSessionId: pending.id,
        qrExpiresAt: pending.expiresAt,
        connectedAt: new Date(),
        lastSeenAt: new Date(),
        lastErrorCode: null
      }
    },
    { upsert: true, new: true }
  );
  // Mongo có thể hoàn tất sau khi QR hết hạn hoặc bị hủy, nên phải bù trừ trước khi publish connected.
  if (!isPendingReady(pending)) {
    await compensateStaleQrWrite(pending, api);
    return;
  }

  pending.status = "connected";
  pending.qrData = undefined;
  pending.zaloUserId = zaloUserId;
  pending.displayName = nullableString(account.displayName) ?? undefined;
  pending.username = nullableString(account.username) ?? undefined;
  runtimeErrorsByOwner.delete(pending.ownerId);
  activeClientsByOwner.set(pending.ownerId, api);
}

// Xóa session vừa ghi khi ownership đã đổi; nếu không xóa được thì chỉ giữ trạng thái lỗi an toàn.
async function compensateStaleQrWrite(pending: PendingZaloPersonalSession, api: ZaloPersonalApi): Promise<void> {
  await stopPendingApi(pending, api).catch(() => undefined);
  if (activeClientsByOwner.get(pending.ownerId) === api) activeClientsByOwner.delete(pending.ownerId);

  try {
    await ZaloPersonalSessionModel.deleteOne({ ownerId: pending.ownerId });
  } catch {
    const errorCode = "ZALO_PERSONAL_QR_COMPENSATION_FAILED";
    runtimeErrorsByOwner.set(pending.ownerId, errorCode);
    if (pendingSessionsByOwner.get(pending.ownerId)?.id === pending.id) {
      pending.cancelled = true;
      pending.status = "error";
      pending.qrData = undefined;
      pending.errorCode = errorCode;
    }
    await ZaloPersonalSessionModel.updateOne(
      { ownerId: pending.ownerId },
      { $set: { status: "error", lastErrorCode: errorCode } }
    ).catch(() => undefined);
  }
}

// Giới hạn số lần restore để lỗi credential hoặc mạng không tạo vòng reconnect vô hạn.
async function restoreZaloPersonalClient(userId: string, encryptedCredentials: string): Promise<ZaloPersonalApi | undefined> {
  const credentials = JSON.parse(decryptSecret(encryptedCredentials)) as unknown;
  let lastFailure: unknown;

  for (let attempt = 0; attempt < RESTORE_ATTEMPTS; attempt += 1) {
    const client = createZaloPersonalClient();
    try {
      const api = await client.login(credentials);
      await api.startListener();
      await ZaloPersonalSessionModel.updateOne(
        { ownerId: userId },
        { $set: { status: "connected", lastSeenAt: new Date(), lastErrorCode: null } }
      );
      runtimeErrorsByOwner.delete(userId);
      activeClientsByOwner.set(userId, api);
      return api;
    } catch (error) {
      lastFailure = error;
      await client.disconnect().catch(() => undefined);
    }
  }

  throw lastFailure instanceof Error ? lastFailure : new Error("Unable to restore Zalo personal session");
}

// Hàng đợi FIFO giữ mọi mutation của một owner tuần tự; Redis lease chỉ mở khóa khi đã xác nhận ownership.
function runOwnerLifecycle<T>(userId: string, operation: () => Promise<T>): Promise<T> {
  const previous = ownerLifecycleTails.get(userId) ?? Promise.resolve();
  const running = (async () => {
    await previous.catch(() => undefined);
    const lease = redisLock && await redisLock.acquire(`zalo-personal:${userId}`, LIFECYCLE_LOCK_TTL_MS);
    if (redisLock && !lease) {
      throw new AppError(503, "ZALO_PERSONAL_LOCK_UNAVAILABLE", "Zalo personal session is temporarily unavailable");
    }
    try {
      return await operation();
    } finally {
      await lease?.release().catch(() => undefined);
    }
  })();
  const tail = running.then(() => undefined, () => undefined);
  ownerLifecycleTails.set(userId, tail);
  void tail.then(() => {
    if (ownerLifecycleTails.get(userId) === tail) ownerLifecycleTails.delete(userId);
  });
  return running;
}

// Chỉ ghi mã lỗi ổn định, không lưu nguyên nhân có thể chứa dữ liệu từ thư viện bên ngoài.
async function recordLogoutStopFailure(userId: string, pending: PendingZaloPersonalSession | undefined): Promise<void> {
  runtimeErrorsByOwner.set(userId, "ZALO_PERSONAL_LOGOUT_STOP_FAILED");
  if (pending) {
    pending.cancelled = true;
    pending.status = "error";
    pending.qrData = undefined;
    pending.errorCode = "ZALO_PERSONAL_LOGOUT_STOP_FAILED";
  }
  await ZaloPersonalSessionModel.updateOne(
    { ownerId: userId },
    { $set: { status: "error", lastErrorCode: "ZALO_PERSONAL_LOGOUT_STOP_FAILED" } }
  ).catch(() => undefined);
}

// Login lỗi sau logout chỉ dọn API vừa tạo; không được tạo lại pending hay session đã bị xóa.
async function recordQrLoginFailure(pending: PendingZaloPersonalSession): Promise<void> {
  if (!isPendingReady(pending)) return;
  pending.status = "error";
  pending.errorCode = "ZALO_PERSONAL_LOGIN_FAILED";
  await pending.client.disconnect().catch(() => undefined);
}

// Hủy QR cũ rồi chờ task native dừng hẳn để không có hai login cùng owner chạy song song.
async function disposePendingQr(pending: PendingZaloPersonalSession, status: PublicStatus, errorCode: string): Promise<void> {
  pending.cancelled = true;
  pending.status = status;
  pending.qrData = undefined;
  pending.errorCode = errorCode;
  if (pending.api) await stopPendingApi(pending, pending.api);
  else await pending.client.disconnect();
  await pending.loginTask;
}

// Dùng một stop promise để completion, logout và thay QR không stop cùng API hai lần.
function stopPendingApi(pending: PendingZaloPersonalSession, api: ZaloPersonalApi): Promise<void> {
  pending.apiStopTask ??= api.stopListener();
  return pending.apiStopTask;
}

function isPendingReady(pending: PendingZaloPersonalSession): boolean {
  return pendingSessionsByOwner.get(pending.ownerId)?.id === pending.id
    && !pending.cancelled
    && pending.status === "waiting_qr"
    && !isExpired(pending.expiresAt);
}

function toQrStatus(session: PendingZaloPersonalSession): ZaloPersonalQrStatus {
  const status = session.status === "waiting_qr" && isExpired(session.expiresAt) ? "expired" : session.status;
  return {
    id: session.id,
    status,
    ...(status === "waiting_qr" && session.qrData ? { qrData: session.qrData, expiresAt: session.expiresAt.toISOString() } : {}),
    ...(session.errorCode ? { errorCode: session.errorCode } : {}),
    ...safeAccountMetadata(session)
  };
}

function safeAccountMetadata(value: { displayName?: unknown; username?: unknown; zaloUserId?: unknown }): Pick<ZaloPersonalStatus, "displayName" | "username" | "zaloUserId"> {
  const displayName = stringValue(value.displayName);
  const username = stringValue(value.username);
  const zaloUserId = stringValue(value.zaloUserId);
  return {
    ...(displayName ? { displayName } : {}),
    ...(username ? { username } : {}),
    ...(zaloUserId ? { zaloUserId } : {})
  };
}

function publicStatus(value: unknown): PublicStatus {
  return value === "waiting_qr" || value === "connected" || value === "expired" || value === "error" || value === "disconnected"
    ? value
    : "error";
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : value && typeof value === "object" && "toString" in value ? String(value) : undefined;
}

function nullableString(value: unknown): string | null {
  return stringValue(value) ?? null;
}

function isExpired(expiresAt: Date): boolean {
  return Date.now() >= expiresAt.getTime();
}
