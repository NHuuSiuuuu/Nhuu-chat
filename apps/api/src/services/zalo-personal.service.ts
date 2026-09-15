import { randomUUID } from "node:crypto";

import { processTelegramCustomerMessage } from "../chatbot/telegram-inbound.service.js";
import { createZaloPersonalClient, type ZaloPersonalApi, type ZaloPersonalClient } from "../channels/zalo-personal/zalo-personal.client.js";
import { ZaloPersonalSessionModel } from "../channels/zalo-personal/zalo-personal.model.js";
import { normalizeZaloPersonalMessage, type NormalizedZaloPersonalMessage } from "../channels/zalo-personal/zalo-personal.normalizer.js";
import { type ZaloPersonalStatus } from "../channels/zalo-personal/zalo-personal.schemas.js";
import { decryptSecret, encryptSecret } from "../common/crypto.js";
import { AppError } from "../common/errors.js";
import { ConversationModel } from "../models/conversation.model.js";
import { CustomerModel } from "../models/customer.model.js";
import { MessageModel } from "../models/message.model.js";
import { emitChatEvent, emitInboxEventToRecipients } from "../realtime/socket.js";
import { toConversation } from "./conversation.service.js";
import { toMessage } from "./message.service.js";

const QR_TTL_MS = 100_000;
const LIFECYCLE_LOCK_TTL_MS = 30_000;
const LIFECYCLE_RENEW_INTERVAL_MS = LIFECYCLE_LOCK_TTL_MS / 2;
const RESTORE_ATTEMPTS = 2;

type PublicStatus = ZaloPersonalStatus["status"];

export type ZaloPersonalQrStatus = ZaloPersonalStatus;

export interface ZaloPersonalRedisLease {
  release(): Promise<void>;
  renew?(): Promise<boolean>;
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
  nativeLoginTask?: Promise<ZaloPersonalApi>;
  api?: ZaloPersonalApi;
  apiStopTask?: Promise<void>;
};

const pendingSessionsByOwner = new Map<string, PendingZaloPersonalSession>();
const activeClientsByOwner = new Map<string, ZaloPersonalApi>();
const heldLeasesByOwner = new Map<string, ZaloPersonalRedisLease>();
const leaseRenewalsByOwner = new Map<string, ReturnType<typeof setInterval>>();
const lostLeasesByOwner = new Map<string, ZaloPersonalRedisLease>();
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
    if (runtimeErrorsByOwner.has(userId)) return getZaloPersonalSessionStatus(userId);

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

    // Sau restart chỉ Mongo biết owner đang bị chặn, nên phải đọc trạng thái trước khi tạo adapter mới.
    let persisted: ZaloPersonalStatus | undefined;
    try {
      persisted = await getPersistedZaloPersonalSessionStatus(userId);
    } catch {
      throw new AppError(503, "ZALO_PERSONAL_SESSION_LOOKUP_FAILED", "Zalo personal session is temporarily unavailable");
    }
    if (persisted && persisted.status !== "expired" && persisted.status !== "disconnected") return persisted;

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
    pending.nativeLoginTask = login;
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

  return await getPersistedZaloPersonalSessionStatus(userId) ?? { id: userId, status: "disconnected" };
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
    try {
      await ZaloPersonalSessionModel.deleteOne({ ownerId: userId });
    } catch {
      // Durable deletion chưa xong thì phải chặn restore/send dù runtime listener đã dừng.
      runtimeErrorsByOwner.set(userId, "ZALO_PERSONAL_LOGOUT_DELETE_FAILED");
      await ZaloPersonalSessionModel.updateOne(
        { ownerId: userId },
        { $set: { status: "error", lastErrorCode: "ZALO_PERSONAL_LOGOUT_DELETE_FAILED" } }
      ).catch(() => undefined);
      throw new AppError(503, "ZALO_PERSONAL_LOGOUT_FAILED", "Zalo personal logout is temporarily unavailable");
    }
  });
}

export async function getActiveZaloPersonalClient(userId: string): Promise<ZaloPersonalApi | undefined> {
  if (runtimeErrorsByOwner.has(userId)) return undefined;
  const active = activeClientsByOwner.get(userId);
  if (active) return active;

  return runOwnerLifecycle(userId, async () => {
    const existing = activeClientsByOwner.get(userId);
    if (existing) return existing;
    if (runtimeErrorsByOwner.has(userId)) return undefined;

    // Không restore document có mã lỗi vì listener cũ có thể chưa dừng được.
    const session = await ZaloPersonalSessionModel.findOne({ ownerId: userId, status: "connected", lastErrorCode: null })
      .select("+encryptedCredentials")
      .lean();
    if (!session?.encryptedCredentials || session.lastErrorCode != null) return undefined;

    return restoreZaloPersonalClient(userId, session.encryptedCredentials);
  });
}

// Khôi phục từng owner độc lập; lỗi một session chỉ được lưu mã an toàn và không chặn owner khác.
export async function restoreActiveZaloPersonalClients(): Promise<void> {
  const sessions = await ZaloPersonalSessionModel.find({ status: "connected", lastErrorCode: null })
    .select("+encryptedCredentials")
    .lean();

  await Promise.all(sessions.map(async (session) => {
    const ownerId = stringValue(session.ownerId);
    // Query là lớp đầu; kiểm tra lại dữ liệu đọc được để không restore document lỗi hoặc owner đã bị chặn.
    if (!ownerId || !session.encryptedCredentials || session.status !== "connected" || session.lastErrorCode != null || runtimeErrorsByOwner.has(ownerId)) return;
    try {
      await runOwnerLifecycle(ownerId, async () => {
        if (activeClientsByOwner.has(ownerId) || runtimeErrorsByOwner.has(ownerId)) return;
        await restoreZaloPersonalClient(ownerId, session.encryptedCredentials);
      });
    } catch (error) {
      // Lock contention chỉ có nghĩa owner đang được process khác quản lý; không được sửa document chung.
      if (error instanceof AppError && error.code === "ZALO_PERSONAL_LOCK_UNAVAILABLE") return;
      await ZaloPersonalSessionModel.updateOne(
        { ownerId },
        { $set: { status: "error", lastErrorCode: "ZALO_PERSONAL_RESTORE_FAILED" } }
      );
    }
  }));
}

// Chỉ chuyển document Mongo thành payload công khai; lastErrorCode ưu tiên hơn status cũ để fail-closed.
async function getPersistedZaloPersonalSessionStatus(userId: string): Promise<ZaloPersonalStatus | undefined> {
  const session = await ZaloPersonalSessionModel.findOne({ ownerId: userId }).lean();
  if (!session) return undefined;

  const errorCode = stringValue(session.lastErrorCode);
  const status: PublicStatus = errorCode ? "error" : publicStatus(session.status);
  return {
    id: stringValue(session._id) ?? userId,
    status,
    ...(status === "error" && errorCode ? { errorCode } : {}),
    ...safeAccountMetadata(session)
  };
}

export async function shutdownActiveZaloPersonalClients(): Promise<void> {
  const owners = new Set([
    ...pendingSessionsByOwner.keys(),
    ...activeClientsByOwner.keys(),
    ...heldLeasesByOwner.keys()
  ]);
  await Promise.all([...owners].map(async (ownerId) => {
    try {
      await runOwnerLifecycle(ownerId, async () => {
        const pending = pendingSessionsByOwner.get(ownerId);
        const active = activeClientsByOwner.get(ownerId);
        if (active) {
          // Pending connected và active cùng trỏ một API, dùng stop memoized để không dừng hai lần.
          if (pending?.api === active) await stopPendingApi(pending, active);
          else await active.stopListener();
        } else if (pending) {
          await stopPendingForShutdown(pending);
        }
        pendingSessionsByOwner.delete(ownerId);
        activeClientsByOwner.delete(ownerId);
        runtimeErrorsByOwner.delete(ownerId);
      });
    } catch {
      // Giữ map và lease khi connector chưa dừng được để không mở listener cạnh tranh.
    }
  }));
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
  attachZaloPersonalMessageSync(pending.ownerId, api);
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
  try {
    await stopPendingApi(pending, api);
  } catch {
    // Stop thất bại có thể để listener sống, nên giữ owner và session để chặn listener cạnh tranh.
    await recordCompensationStopFailure(pending);
    return;
  }
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

// Chỉ lưu mã ổn định khi compensation không dừng được listener; credential vẫn được giữ để không mất ownership.
async function recordCompensationStopFailure(pending: PendingZaloPersonalSession): Promise<void> {
  const errorCode = "ZALO_PERSONAL_QR_COMPENSATION_STOP_FAILED";
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

// Giới hạn số lần restore để lỗi credential hoặc mạng không tạo vòng reconnect vô hạn.
async function restoreZaloPersonalClient(userId: string, encryptedCredentials: string): Promise<ZaloPersonalApi | undefined> {
  const credentials = JSON.parse(decryptSecret(encryptedCredentials)) as unknown;
  let lastFailure: unknown;

  for (let attempt = 0; attempt < RESTORE_ATTEMPTS; attempt += 1) {
    const client = createZaloPersonalClient();
    try {
      const api = await client.login(credentials);
      attachZaloPersonalMessageSync(userId, api);
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
      try {
        await client.disconnect();
      } catch {
        runtimeErrorsByOwner.set(userId, "ZALO_PERSONAL_RESTORE_STOP_FAILED");
        await ZaloPersonalSessionModel.updateOne(
          { ownerId: userId },
          { $set: { status: "error", lastErrorCode: "ZALO_PERSONAL_RESTORE_STOP_FAILED" } }
        ).catch(() => undefined);
        throw new AppError(503, "ZALO_PERSONAL_RESTORE_STOP_FAILED", "Zalo personal session cleanup is temporarily unavailable");
      }
    }
  }

  throw lastFailure instanceof Error ? lastFailure : new Error("Unable to restore Zalo personal session");
}

// Listener chỉ chuyển event đã chuẩn hóa vào cùng luồng lưu trữ, không để payload native rò sang service.
function attachZaloPersonalMessageSync(userId: string, api: ZaloPersonalApi): void {
  // Native socket errors phải được chuyển thành trạng thái an toàn, không được thoát process.
  api.onError(() => {
    void handleZaloPersonalListenerError(userId, api).catch(() => undefined);
  });
  api.onClosed(() => {
    void handleZaloPersonalListenerError(userId, api).catch(() => undefined);
  });
  api.onMessage(async (event) => {
    const session = await ZaloPersonalSessionModel.findOne({ ownerId: userId, status: "connected", lastErrorCode: null }).lean();
    if (!session || stringValue(session.ownerId) !== userId) return;
    const accountId = stringValue(session.zaloUserId);
    if (!accountId) return;

    const message = normalizeZaloPersonalMessage(event, accountId);
    if (!message || message.isSelf) return;
    await ingestZaloPersonalMessage(userId, message);
  });
}

// Đánh dấu listener lỗi và dừng nó độc lập với callback native để tránh unhandled rejection.
async function handleZaloPersonalListenerError(userId: string, api: ZaloPersonalApi): Promise<void> {
  if (activeClientsByOwner.get(userId) !== api) return;
  const errorCode = "ZALO_PERSONAL_LISTENER_ERROR";
  runtimeErrorsByOwner.set(userId, errorCode);
  await ZaloPersonalSessionModel.updateOne(
    { ownerId: userId },
    { $set: { status: "error", lastErrorCode: errorCode } }
  ).catch(() => undefined);
  try {
    await api.stopListener();
    if (activeClientsByOwner.get(userId) === api) activeClientsByOwner.delete(userId);
    const lease = heldLeasesByOwner.get(userId);
    if (lease) await releaseHeldLease(userId, lease);
  } catch {
    // Giữ error guard và client runtime khi native stop chưa được xác nhận.
  }
}

// Lưu tin inbound trước realtime để replay không thể phát event hoặc gọi bot lần thứ hai.
async function ingestZaloPersonalMessage(userId: string, message: NormalizedZaloPersonalMessage): Promise<void> {
  const session = await ZaloPersonalSessionModel.findOne({ ownerId: userId, status: "connected", lastErrorCode: null }).lean();
  if (!session || stringValue(session.ownerId) !== userId || message.isSelf) return;
  const accountId = stringValue(session.zaloUserId);
  if (!accountId) return;
  const idempotencyKey = `zalo_personal:${accountId}:${message.externalMessageId}`;
  if (await MessageModel.exists({ platform: "zalo_personal", externalMessageId: idempotencyKey })) return;

  const customer = await CustomerModel.findOneAndUpdate(
    { platform: "zalo_personal", platformId: message.senderId },
    {
      $set: {
        name: message.senderName || "Zalo user",
        ...(message.avatarUrl ? { avatarUrl: message.avatarUrl } : {})
      },
      $setOnInsert: { platform: "zalo_personal", platformId: message.senderId }
    },
    { upsert: true, new: true }
  );
  const conversation = await ConversationModel.findOneAndUpdate(
    { platform: "zalo_personal", channelId: message.channelId, ownerId: userId },
    {
      $set: {
        customerId: customer._id,
        ownerId: userId,
        conversationType: message.chatType,
        conversationName: message.chatType === "group" ? message.channelId : null
      }
    },
    { upsert: true, new: true }
  );

  let storedMessage;
  try {
    storedMessage = await MessageModel.create({
      conversationId: conversation._id,
      platform: "zalo_personal",
      externalMessageId: idempotencyKey,
      senderType: "customer",
      senderId: message.senderId,
      type: message.type,
      content: message.content,
      deliveryStatus: "delivered",
      metadata: { senderName: message.senderName || "Zalo user", ...message.metadata }
    });
  } catch (error) {
    if (isDuplicateKey(error)) return;
    throw error;
  }

  const updatedConversation = await ConversationModel.findOneAndUpdate(
    { _id: conversation._id, ownerId: userId },
    {
      $set: { lastMessageAt: message.sentAt, lastMessageSnippet: message.content },
      $inc: { unreadCount: 1 }
    },
    { returnDocument: "after" }
  );
  if (!updatedConversation) return;

  await updatedConversation.populate("customerId", "name avatarUrl");
  await updatedConversation.populate("tagIds", "name color");
  const conversationPayload = toConversation(updatedConversation.toObject(), {
    name: stringValue(session.displayName),
    avatarUrl: stringValue(session.avatarUrl)
  });
  emitChatEvent("chat:message_received", String(updatedConversation._id), toMessage(storedMessage.toObject()));
  emitInboxEventToRecipients(
    "chat:conversation_updated",
    [userId, updatedConversation.assignedAgentId ? String(updatedConversation.assignedAgentId) : ""],
    conversationPayload
  );
  try {
    await processTelegramCustomerMessage({
      ownerId: userId,
      conversationId: String(updatedConversation._id),
      customerMessageId: String(storedMessage._id),
      externalMessageId: message.externalMessageId,
      platform: "zalo_personal",
      channelId: message.channelId,
      senderType: "customer",
      type: message.type,
      content: message.content
    });
  } catch {
    // Bot lỗi không được ném lại để native listener replay tin khách đã lưu thành công.
  }
}

function isDuplicateKey(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
}

// Hàng đợi FIFO giữ mọi mutation của một owner tuần tự; Redis lease chỉ mở khóa khi đã xác nhận ownership.
function runOwnerLifecycle<T>(userId: string, operation: () => Promise<T>): Promise<T> {
  const previous = ownerLifecycleTails.get(userId) ?? Promise.resolve();
  const running = (async () => {
    await previous.catch(() => undefined);
    const heldLease = heldLeasesByOwner.get(userId);
    const lease = heldLease ?? (redisLock && await redisLock.acquire(`zalo-personal:${userId}`, LIFECYCLE_LOCK_TTL_MS));
    if (!redisLock || !lease) {
      throw new AppError(503, "ZALO_PERSONAL_LOCK_UNAVAILABLE", "Zalo personal session is temporarily unavailable");
    }
    if (!heldLease) {
      // Bắt đầu gia hạn ngay sau khi acquire để restore/login chậm không vượt TTL ban đầu.
      heldLeasesByOwner.set(userId, lease);
      startHeldLeaseRenewal(userId, lease);
    }
    let operationSucceeded = false;
    try {
      const result = await operation();
      operationSucceeded = true;
      return result;
    } finally {
      const pending = pendingSessionsByOwner.get(userId);
      const retainsOwnership = activeClientsByOwner.has(userId)
        || runtimeErrorsByOwner.has(userId)
        || (pending?.status === "waiting_qr")
        || (!operationSucceeded && Boolean(pending));
      if (!retainsOwnership && lease) await releaseHeldLease(userId, lease);
    }
  })();
  const tail = running.then(() => undefined, () => undefined);
  ownerLifecycleTails.set(userId, tail);
  void tail.then(() => {
    if (ownerLifecycleTails.get(userId) === tail) ownerLifecycleTails.delete(userId);
  });
  return running;
}

// Xóa map trước khi await release để mọi đường dọn dẹp khác đều không release cùng token lần nữa.
async function releaseHeldLease(userId: string, lease: ZaloPersonalRedisLease): Promise<void> {
  if (heldLeasesByOwner.get(userId) !== lease) return;
  const renewal = leaseRenewalsByOwner.get(userId);
  if (renewal) clearInterval(renewal);
  leaseRenewalsByOwner.delete(userId);
  heldLeasesByOwner.delete(userId);
  if (lostLeasesByOwner.get(userId) === lease) lostLeasesByOwner.delete(userId);
  await lease.release().catch(() => undefined);
}

// Gia hạn định kỳ để listener dài hơn TTL vẫn giữ ownership phân tán của owner.
function startHeldLeaseRenewal(userId: string, lease: ZaloPersonalRedisLease): void {
  const renew = lease.renew;
  if (!renew) {
    markRedisLeaseLost(userId, lease);
    return;
  }
  if (leaseRenewalsByOwner.has(userId)) return;
  const renewal = setInterval(() => {
    if (heldLeasesByOwner.get(userId) !== lease || lostLeasesByOwner.get(userId) === lease) return;
    void renewWithDeadline(renew).then((retained) => {
      if (!retained) markRedisLeaseLost(userId, lease);
    }, () => {
      markRedisLeaseLost(userId, lease);
    });
  }, LIFECYCLE_RENEW_INTERVAL_MS);
  renewal.unref?.();
  leaseRenewalsByOwner.set(userId, renewal);
}

// Redis command bị treo cũng phải được xem là mất lease trước khi TTL hết hạn.
async function renewWithDeadline(renew: () => Promise<boolean>): Promise<boolean> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      renew(),
      new Promise<boolean>((resolve) => {
        timeout = setTimeout(() => resolve(false), LIFECYCLE_RENEW_INTERVAL_MS);
        timeout.unref?.();
      })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

// Mất lease phải fence runtime ngay lập tức, không xếp sau một operation Mongo đang bị treo.
function markRedisLeaseLost(userId: string, lease: ZaloPersonalRedisLease): void {
  if (heldLeasesByOwner.get(userId) !== lease || lostLeasesByOwner.has(userId)) return;
  lostLeasesByOwner.set(userId, lease);
  void fenceLostLease(userId, lease).catch(() => undefined);
}

// Dừng native transport trước khi chờ persistence để lease loss không còn đường gửi/nhận tin.
async function fenceLostLease(userId: string, lease: ZaloPersonalRedisLease): Promise<void> {
  if (heldLeasesByOwner.get(userId) !== lease) return;
  const pending = pendingSessionsByOwner.get(userId);
  const active = activeClientsByOwner.get(userId);
  runtimeErrorsByOwner.set(userId, "ZALO_PERSONAL_REDIS_LEASE_LOST");
  if (pending) {
    pending.cancelled = true;
    pending.status = "error";
    pending.qrData = undefined;
    pending.errorCode = "ZALO_PERSONAL_REDIS_LEASE_LOST";
  }
  try {
    if (active) {
      if (pending?.api === active) await stopPendingApi(pending, active);
      else await active.stopListener();
    } else if (pending) {
      if (pending.api) await stopPendingApi(pending, pending.api);
      else await pending.client.disconnect();
    }
  } catch {
    // Giữ guard và lease khi stop lỗi để process này không tự tạo listener cạnh tranh.
    return;
  }

  await ZaloPersonalSessionModel.updateOne(
    { ownerId: userId },
    { $set: { status: "error", lastErrorCode: "ZALO_PERSONAL_REDIS_LEASE_LOST" } }
  ).catch(() => undefined);
  if (activeClientsByOwner.get(userId) === active) activeClientsByOwner.delete(userId);
  if (pendingSessionsByOwner.get(userId) === pending) pendingSessionsByOwner.delete(userId);
  await releaseHeldLease(userId, lease);
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
  pending.errorCode = "ZALO_QR_CREATE_FAILED";
  await pending.client.disconnect().catch(() => undefined);
}

// Shutdown đã hủy connector nên không giữ lease vô hạn chỉ vì native login không chịu settle.
async function stopPendingForShutdown(pending: PendingZaloPersonalSession): Promise<void> {
  pending.cancelled = true;
  pending.status = "error";
  pending.qrData = undefined;
  pending.errorCode = "ZALO_PERSONAL_SHUTDOWN";
  if (pending.api) await stopPendingApi(pending, pending.api);
  else await pending.client.disconnect();
}

// Hủy QR cũ rồi chờ task native dừng hẳn để không có hai login cùng owner chạy song song.
async function disposePendingQr(pending: PendingZaloPersonalSession, status: PublicStatus, errorCode: string): Promise<void> {
  pending.cancelled = true;
  pending.status = status;
  pending.qrData = undefined;
  pending.errorCode = errorCode;
  if (pending.api) await stopPendingApi(pending, pending.api);
  else await pending.client.disconnect();
  // Chỉ chờ native promise; completion của nó có thể đã xếp sau operation logout hiện tại.
  await pending.nativeLoginTask?.catch(() => undefined);
}

// Dùng một stop promise để completion, logout và thay QR không stop cùng API hai lần.
function stopPendingApi(pending: PendingZaloPersonalSession, api: ZaloPersonalApi): Promise<void> {
  if (!pending.apiStopTask) {
    const stopTask = api.stopListener().catch((error: unknown) => {
      // Cho phép lần cleanup sau thử lại khi stop thất bại, nhưng các caller đồng thời vẫn dùng cùng promise.
      if (pending.apiStopTask === stopTask) pending.apiStopTask = undefined;
      throw error;
    });
    pending.apiStopTask = stopTask;
  }
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
