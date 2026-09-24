import type { InstagramConnectionResponse, InstagramDisconnectResponse } from "@nhuu-chat/contracts";

import { decryptSecret, encryptSecret } from "../common/crypto.js";
import { AppError } from "../common/errors.js";
import { InstagramAccountConnectionModel } from "../models/instagram-account-connection.model.js";
import { InstagramMetaClient } from "./instagram-meta.client.js";
import { recordSettingHistorySafely } from "./setting-history.service.js";

const SUBSCRIBE_PENDING = "INSTAGRAM_SUBSCRIBE_PENDING";
const REMOVE_PENDING = "INSTAGRAM_REMOVE_PENDING";

interface RecordShape {
  _id: unknown;
  ownerUserId: unknown;
  instagramUserId: string;
  username?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  encryptedAccessToken?: string;
  tokenExpiresAt?: Date | null;
  status: "connected" | "invalid" | "disconnected";
  subscribedAt?: Date | null;
  lastValidatedAt?: Date | null;
  lastErrorCode?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface ModelShape {
  findOne(filter: Record<string, unknown>): { select(selection: string): { lean(): Promise<RecordShape | null> } };
  find(filter: Record<string, unknown>): { sort(sort: Record<string, number>): { lean(): Promise<RecordShape[]> } };
  create(input: Record<string, unknown>): Promise<RecordShape>;
  findOneAndUpdate(filter: Record<string, unknown>, update: { $set: Record<string, unknown> }, options: Record<string, unknown>): Promise<RecordShape | null>;
  findOneAndDelete(filter: Record<string, unknown>): Promise<RecordShape | null>;
}

interface ConnectInput {
  instagramUserId: string;
  accessToken: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  expiresAt: Date | null;
}

interface Dependencies {
  model?: ModelShape;
  meta?: Pick<InstagramMetaClient, "subscribe" | "unsubscribe" | "refreshLongToken">;
  encrypt?: (value: string) => string;
  decrypt?: (value: string) => string;
  recordHistory?: typeof recordSettingHistorySafely;
}

function responseOf(row: RecordShape): InstagramConnectionResponse {
  return {
    id: String(row._id),
    instagramUserId: row.instagramUserId,
    username: row.username ?? null,
    displayName: row.displayName ?? null,
    avatarUrl: row.avatarUrl ?? null,
    status: row.status,
    tokenExpiresAt: row.tokenExpiresAt?.toISOString() ?? null,
    subscribedAt: row.subscribedAt?.toISOString() ?? null,
    lastValidatedAt: row.lastValidatedAt?.toISOString() ?? null,
    lastErrorCode: row.lastErrorCode ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function historyMetadata(row: RecordShape) {
  return { platform: "instagram", channelId: row.instagramUserId, username: row.username ?? null };
}

function claimConflict(): AppError {
  return new AppError(409, "INSTAGRAM_ACCOUNT_ALREADY_CONNECTED", "Instagram account is already connected");
}

function isDuplicate(error: unknown): boolean {
  return (error as { code?: number } | null)?.code === 11000;
}

export class InstagramAccountService {
  private readonly model: ModelShape;
  private readonly meta: NonNullable<Dependencies["meta"]>;
  private readonly encrypt: NonNullable<Dependencies["encrypt"]>;
  private readonly decrypt: NonNullable<Dependencies["decrypt"]>;
  private readonly recordHistory: NonNullable<Dependencies["recordHistory"]>;

  constructor(dependencies: Dependencies = {}) {
    this.model = dependencies.model ?? InstagramAccountConnectionModel as unknown as ModelShape;
    this.meta = dependencies.meta ?? new InstagramMetaClient();
    this.encrypt = dependencies.encrypt ?? encryptSecret;
    this.decrypt = dependencies.decrypt ?? decryptSecret;
    this.recordHistory = dependencies.recordHistory ?? recordSettingHistorySafely;
  }

  // Giữ claim toàn cục trước lệnh subscribe để hai Workspace không thể dùng chung account.
  async connect(ownerUserId: string, input: ConnectInput): Promise<InstagramConnectionResponse> {
    const existing = await this.model.findOne({ instagramUserId: input.instagramUserId }).select("+encryptedAccessToken").lean();
    const prior = existing ? { ...existing } : null;
    if (existing && String(existing.ownerUserId) !== ownerUserId) throw claimConflict();
    if (existing?.lastErrorCode === SUBSCRIBE_PENDING || existing?.lastErrorCode === REMOVE_PENDING) {
      throw new AppError(409, "INSTAGRAM_CONNECTION_BUSY", "Instagram connection is being updated");
    }
    const now = new Date();
    const values = {
      ownerUserId,
      instagramUserId: input.instagramUserId,
      username: input.username,
      displayName: input.displayName,
      avatarUrl: input.avatarUrl,
      encryptedAccessToken: this.encrypt(input.accessToken),
      tokenExpiresAt: input.expiresAt,
      status: "invalid",
      subscribedAt: null,
      lastValidatedAt: now,
      lastErrorCode: SUBSCRIBE_PENDING
    };
    let reserved: RecordShape | null;
    try {
      reserved = existing
        ? await this.model.findOneAndUpdate({ _id: existing._id, ownerUserId, status: existing.status, lastErrorCode: existing.lastErrorCode ?? null }, { $set: values }, { returnDocument: "after" })
        : await this.model.create(values);
    } catch (error) {
      if (isDuplicate(error)) throw claimConflict();
      throw error;
    }
    if (!reserved) throw new AppError(409, "INSTAGRAM_CONNECTION_BUSY", "Instagram connection is being updated");
    try {
      await this.meta.subscribe(input.instagramUserId, input.accessToken);
    } catch {
      const recovery = prior?.status === "connected" ? {
        status: prior.status,
        username: prior.username ?? null,
        displayName: prior.displayName ?? null,
        avatarUrl: prior.avatarUrl ?? null,
        encryptedAccessToken: prior.encryptedAccessToken,
        tokenExpiresAt: prior.tokenExpiresAt ?? null,
        subscribedAt: prior.subscribedAt ?? null,
        lastValidatedAt: prior.lastValidatedAt ?? null,
        lastErrorCode: prior.lastErrorCode ?? null
      } : { lastErrorCode: "INSTAGRAM_SUBSCRIBE_FAILED" };
      await this.model.findOneAndUpdate({ _id: reserved._id, ownerUserId, lastErrorCode: SUBSCRIBE_PENDING }, { $set: recovery }, { returnDocument: "after" }).catch(() => undefined);
      throw new AppError(502, "INSTAGRAM_SUBSCRIBE_FAILED", "Instagram subscription failed");
    }
    let connected: RecordShape | null;
    try {
      connected = await this.model.findOneAndUpdate(
        { _id: reserved._id, ownerUserId, lastErrorCode: SUBSCRIBE_PENDING },
        { $set: { status: "connected", subscribedAt: new Date(), lastErrorCode: null } },
        { returnDocument: "after" }
      );
    } catch {
      connected = null;
    }
    if (!connected) {
      await this.model.findOneAndUpdate(
        { _id: reserved._id, ownerUserId, lastErrorCode: SUBSCRIBE_PENDING },
        { $set: { lastErrorCode: "INSTAGRAM_SUBSCRIBE_CONFIRM_FAILED" } },
        { returnDocument: "after" }
      ).catch(() => undefined);
      throw new AppError(503, "INSTAGRAM_CONNECTION_FAILED", "Instagram connection could not be saved");
    }
    if (existing?.status !== "connected") {
      this.recordHistory({ userId: ownerUserId, actionType: "CONNECT_CHANNEL", actionTitle: "Kết nối Instagram", oldValue: {}, newValue: historyMetadata(connected) });
    }
    return responseOf(connected);
  }

  async list(ownerUserId: string): Promise<InstagramConnectionResponse[]> {
    const rows = await this.model.find({ ownerUserId }).sort({ createdAt: 1, _id: 1 }).lean();
    return rows.map(responseOf);
  }

  // Ngắt kết nối có điều kiện theo owner; lặp lại sau khi xóa trả về trạng thái không đổi.
  async disconnect(ownerUserId: string, connectionId: string): Promise<InstagramDisconnectResponse> {
    const existing = await this.model.findOne({ _id: connectionId, ownerUserId }).select("+encryptedAccessToken").lean();
    if (!existing) return { disconnected: false };
    if (existing.lastErrorCode === REMOVE_PENDING || existing.lastErrorCode === SUBSCRIBE_PENDING) {
      throw new AppError(409, "INSTAGRAM_CONNECTION_BUSY", "Instagram connection is being updated");
    }
    const removing = await this.model.findOneAndUpdate(
      { _id: existing._id, ownerUserId, status: existing.status, lastErrorCode: existing.lastErrorCode ?? null },
      { $set: { status: "invalid", lastErrorCode: REMOVE_PENDING } },
      { returnDocument: "after" }
    );
    if (!removing) throw new AppError(409, "INSTAGRAM_CONNECTION_BUSY", "Instagram connection is being updated");
    if (existing.subscribedAt && existing.encryptedAccessToken) {
      try {
        await this.meta.unsubscribe(existing.instagramUserId, this.decrypt(existing.encryptedAccessToken));
      } catch {
        await this.model.findOneAndUpdate({ _id: existing._id, ownerUserId, lastErrorCode: REMOVE_PENDING }, { $set: { lastErrorCode: "INSTAGRAM_UNSUBSCRIBE_FAILED" } }, { returnDocument: "after" }).catch(() => undefined);
        throw new AppError(502, "INSTAGRAM_UNSUBSCRIBE_FAILED", "Instagram unsubscribe failed");
      }
    }
    const deleted = await this.model.findOneAndDelete({ _id: existing._id, ownerUserId, lastErrorCode: REMOVE_PENDING });
    if (!deleted) throw new AppError(503, "INSTAGRAM_DISCONNECT_FAILED", "Instagram disconnection could not be saved");
    this.recordHistory({ userId: ownerUserId, actionType: "DISCONNECT_CHANNEL", actionTitle: "Ngắt kết nối Instagram", oldValue: historyMetadata(existing), newValue: {} });
    return { disconnected: true };
  }

  // Làm mới long-lived token khi còn hợp lệ; caller có thể chạy trước thời điểm hết hạn.
  async refresh(ownerUserId: string, connectionId: string): Promise<InstagramConnectionResponse> {
    const row = await this.model.findOne({ _id: connectionId, ownerUserId }).select("+encryptedAccessToken").lean();
    if (!row?.encryptedAccessToken || row.status !== "connected" || (row.tokenExpiresAt && row.tokenExpiresAt <= new Date())) {
      throw new AppError(409, "INSTAGRAM_TOKEN_NOT_REFRESHABLE", "Instagram token cannot be refreshed");
    }
    const refreshed = await this.meta.refreshLongToken(this.decrypt(row.encryptedAccessToken));
    const updated = await this.model.findOneAndUpdate(
      { _id: row._id, ownerUserId, encryptedAccessToken: row.encryptedAccessToken, status: "connected" },
      { $set: { encryptedAccessToken: this.encrypt(refreshed.accessToken), tokenExpiresAt: refreshed.expiresAt, lastValidatedAt: new Date() } },
      { returnDocument: "after" }
    );
    if (!updated) throw new AppError(409, "INSTAGRAM_CONNECTION_BUSY", "Instagram connection is being updated");
    return responseOf(updated);
  }
}

export const instagramAccountService = new InstagramAccountService();
