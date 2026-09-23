import type { FacebookPageConnectionResponse } from "@nhuu-chat/contracts";
import { env } from "@nhuu-chat/config";

import { decryptSecret, encryptSecret } from "../common/crypto.js";
import { AppError } from "../common/errors.js";
import { facebookMessengerClient } from "../channels/facebook-messenger/facebook-messenger.client.js";
import { FacebookPageConnectionModel } from "../models/facebook-page-connection.model.js";
import { recordSettingHistory } from "./setting-history.service.js";

const FACEBOOK_GRAPH_REQUEST_TIMEOUT_MS = 10_000;
const SUBSCRIBE_PENDING = "FACEBOOK_MESSENGER_SUBSCRIBE_PENDING";
const SUBSCRIBE_CONFIRM_FAILED = "FACEBOOK_MESSENGER_SUBSCRIBE_CONFIRM_FAILED";
const REPLACE_PENDING = "FACEBOOK_MESSENGER_REPLACE_PENDING";
const REMOVE_PENDING = "FACEBOOK_MESSENGER_REMOVE_PENDING";

type GraphFetch = (input: string, init?: RequestInit) => Promise<Response>;

interface FacebookPageConnectionRecord {
  _id: unknown;
  userId?: unknown;
  pageId: string;
  encryptedPageAccessToken?: string;
  pageName?: string | null;
  avatarUrl?: string | null;
  status: "connected" | "invalid";
  lastValidatedAt?: Date | null;
  lastErrorCode?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface ValidatedPageValues {
  pageId: string;
  pageName: string | null;
  avatarUrl: string | null;
  encryptedPageAccessToken: string;
  lastValidatedAt: Date;
}

interface ConnectionModel {
  findOne(filter: Record<string, unknown>): { select(selection: string): { lean(): Promise<FacebookPageConnectionRecord | null> }; lean(): Promise<FacebookPageConnectionRecord | null> };
  findOneAndUpdate(filter: Record<string, unknown>, update: Record<string, unknown>, options: Record<string, unknown>): Promise<FacebookPageConnectionRecord | null>;
  create(input: Record<string, unknown>): Promise<FacebookPageConnectionRecord>;
  findOneAndDelete(filter: Record<string, unknown>): Promise<FacebookPageConnectionRecord | null>;
}

type MessengerSubscriptionClient = Pick<typeof facebookMessengerClient, "subscribePage" | "unsubscribePage">;

export interface FacebookPageServiceDependencies {
  model?: ConnectionModel;
  fetchGraph?: GraphFetch;
  encryptSecret?: (value: string) => string;
  decryptSecret?: (value: string) => string;
  messengerClient?: MessengerSubscriptionClient;
  graphApiVersion?: string;
  graphRequestTimeoutMs?: number;
}

function stringId(value: unknown): string {
  return typeof value === "string" ? value : String(value);
}

function toResponse(record: FacebookPageConnectionRecord): FacebookPageConnectionResponse {
  return {
    id: stringId(record._id),
    pageId: record.pageId,
    pageName: record.pageName ?? null,
    avatarUrl: record.avatarUrl ?? null,
    status: record.status,
    lastValidatedAt: record.lastValidatedAt?.toISOString() ?? null,
    lastErrorCode: record.lastErrorCode ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

function toHistoryMetadata(record: FacebookPageConnectionRecord | null) {
  if (!record) return {};
  return {
    pageId: record.pageId,
    pageName: record.pageName ?? null,
    status: record.status
  };
}

function pageOwnershipError(): AppError {
  return new AppError(409, "FACEBOOK_PAGE_ALREADY_CONNECTED", "Facebook Page is already connected");
}

function connectionStateError(): AppError {
  return new AppError(409, "FACEBOOK_PAGE_CONNECTION_BUSY", "Facebook Page connection is being updated");
}

function connectionPersistenceError(): AppError {
  return new AppError(503, "FACEBOOK_PAGE_CONNECTION_FAILED", "Facebook Page connection could not be saved");
}

function safeMessengerError(error: unknown, operation: "SUBSCRIBE" | "UNSUBSCRIBE"): AppError {
  if (error instanceof AppError && /^FACEBOOK_MESSENGER_[A-Z_]+$/.test(error.code)) {
    return new AppError(error.statusCode, error.code, "Facebook Messenger request failed");
  }
  return new AppError(502, `FACEBOOK_MESSENGER_${operation}_FAILED`, "Facebook Messenger request failed");
}

function claimFilter(userId: string, record: FacebookPageConnectionRecord): Record<string, unknown> {
  return {
    _id: record._id,
    userId,
    pageId: record.pageId,
    pageName: record.pageName ?? null,
    status: record.status,
    lastErrorCode: record.lastErrorCode ?? null,
    encryptedPageAccessToken: record.encryptedPageAccessToken
  };
}

function isTransition(record: FacebookPageConnectionRecord): boolean {
  return [SUBSCRIBE_PENDING, REPLACE_PENDING, REMOVE_PENDING].includes(record.lastErrorCode ?? "");
}

function isPageDuplicate(error: unknown): boolean {
  const conflict = error as { code?: number; keyPattern?: { pageId?: number } } | null;
  return conflict?.code === 11000 && conflict.keyPattern?.pageId === 1;
}

function recordSettingHistorySafely(input: Parameters<typeof recordSettingHistory>[0]): void {
  void recordSettingHistory(input).catch((error) => {
    console.error("Failed to record setting history", {
      userId: input.userId,
      actionType: input.actionType,
      error
    });
  });
}

function graphErrorCode(body: unknown): number | undefined {
  if (!body || typeof body !== "object") return undefined;
  const error = (body as { error?: unknown }).error;
  if (!error || typeof error !== "object") return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "number" ? code : undefined;
}

// Đọc URL avatar tùy chọn từ Graph và trả về null khi payload không đầy đủ.
function graphPictureUrl(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const picture = (body as { picture?: unknown }).picture;
  if (!picture || typeof picture !== "object") return null;
  const data = (picture as { data?: unknown }).data;
  if (!data || typeof data !== "object") return null;
  const url = (data as { url?: unknown }).url;
  return typeof url === "string" && url.length > 0 ? url : null;
}

async function fetchGraphResponse(fetchGraph: GraphFetch, url: URL, timeoutMs: number): Promise<{ response: Response; body: unknown }> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const response = await fetchGraph(url.toString(), { method: "GET", signal: controller.signal });
        return { response, body: await response.json() };
      })(),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(new Error("Facebook Page validation timed out"));
        }, timeoutMs);
      })
    ]);
  } catch {
    throw new AppError(400, "FACEBOOK_PAGE_VALIDATION_FAILED", "Facebook Page credentials could not be validated");
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export class FacebookPageService {
  private readonly model: ConnectionModel;
  private readonly fetchGraph: GraphFetch;
  private readonly encrypt: (value: string) => string;
  private readonly decrypt: (value: string) => string;
  private readonly messengerClient: MessengerSubscriptionClient;
  private readonly graphApiVersion: string;
  private readonly graphRequestTimeoutMs: number;

  constructor(dependencies: FacebookPageServiceDependencies = {}) {
    this.model = dependencies.model ?? FacebookPageConnectionModel;
    this.fetchGraph = dependencies.fetchGraph ?? fetch;
    this.encrypt = dependencies.encryptSecret ?? encryptSecret;
    this.decrypt = dependencies.decryptSecret ?? decryptSecret;
    this.messengerClient = dependencies.messengerClient ?? facebookMessengerClient;
    this.graphApiVersion = dependencies.graphApiVersion ?? env.META_GRAPH_API_VERSION;
    this.graphRequestTimeoutMs = dependencies.graphRequestTimeoutMs ?? FACEBOOK_GRAPH_REQUEST_TIMEOUT_MS;
  }

  // Xác thực Page trong deadline hữu hạn trước khi mã hóa và lưu token.
  async connect(userId: string, input: { pageId: string; pageAccessToken: string }): Promise<FacebookPageConnectionResponse> {
    const url = new URL(`https://graph.facebook.com/${this.graphApiVersion}/${encodeURIComponent(input.pageId)}`);
    url.searchParams.set("fields", "id,name,picture.type(large)");
    url.searchParams.set("access_token", input.pageAccessToken);

    const { response, body } = await fetchGraphResponse(this.fetchGraph, url, this.graphRequestTimeoutMs);

    if (!response.ok || graphErrorCode(body) !== undefined) {
      const code = graphErrorCode(body);
      if (code === 190 || response.status === 401) {
        throw new AppError(401, "FACEBOOK_PAGE_TOKEN_INVALID", "Facebook Page access token is invalid");
      }
      throw new AppError(400, "FACEBOOK_PAGE_VALIDATION_FAILED", "Facebook Page credentials could not be validated");
    }

    const metadata = body && typeof body === "object" ? body as { id?: unknown; name?: unknown } : {};
    if (metadata.id !== input.pageId) {
      throw new AppError(400, "FACEBOOK_PAGE_ID_MISMATCH", "Facebook returned a different Page ID");
    }

    const encryptedPageAccessToken = this.encrypt(input.pageAccessToken);
    const values: ValidatedPageValues = {
      pageId: input.pageId,
      pageName: typeof metadata.name === "string" ? metadata.name : null,
      avatarUrl: graphPictureUrl(body),
      encryptedPageAccessToken,
      lastValidatedAt: new Date()
    };
    let existing: FacebookPageConnectionRecord | null;
    let reserved: FacebookPageConnectionRecord;
    // Mongo giữ Page claim trước mọi tác động Meta; unique index phân xử kết nối cạnh tranh.
    for (;;) {
      existing = await this.model.findOne({ userId }).select("+encryptedPageAccessToken").lean();
      const otherOwner = await this.model.findOne({ pageId: input.pageId, userId: { $ne: userId } }).lean();
      if (otherOwner && (otherOwner.userId === undefined || stringId(otherOwner.userId) !== userId)) {
        throw pageOwnershipError();
      }
      if (existing) {
        if (isTransition(existing)) throw connectionStateError();
        if (existing.pageId !== input.pageId) {
          const replacement = await this.reserveReplacement(userId, existing, values);
          if (!replacement) continue;
          reserved = replacement;
          break;
        }
        try {
          const updated = await this.model.findOneAndUpdate(
            claimFilter(userId, existing),
            { $set: { ...values, status: "invalid", lastErrorCode: SUBSCRIBE_PENDING } },
            { returnDocument: "after" }
          );
          if (!updated) continue;
          reserved = { ...updated, encryptedPageAccessToken };
          break;
        } catch (error) {
          if (isPageDuplicate(error)) throw pageOwnershipError();
          throw error;
        }
      }
      try {
        reserved = await this.model.create({
          userId, platform: "facebook", ...values, status: "invalid", lastErrorCode: SUBSCRIBE_PENDING
        });
        reserved = { ...reserved, encryptedPageAccessToken };
        break;
      } catch (error) {
        if (isPageDuplicate(error)) throw pageOwnershipError();
        const conflict = error as { code?: number; keyPattern?: { userId?: number } } | null;
        if (conflict?.code !== 11000 || conflict.keyPattern?.userId !== 1) throw error;
      }
    }
    try {
      await this.messengerClient.subscribePage({ pageId: input.pageId, pageAccessToken: input.pageAccessToken });
    } catch (error) {
      const safeError = safeMessengerError(error, "SUBSCRIBE");
      if (["FACEBOOK_MESSENGER_TOKEN_INVALID", "FACEBOOK_MESSENGER_PERMISSION_DENIED", "FACEBOOK_MESSENGER_RATE_LIMITED"].includes(safeError.code)) {
        await this.model.findOneAndUpdate(
          { ...claimFilter(userId, reserved), lastErrorCode: SUBSCRIBE_PENDING },
          { $set: { lastErrorCode: safeError.code } },
          { returnDocument: "after" }
        ).catch(() => undefined);
      }
      throw safeError;
    }
    let saved: FacebookPageConnectionRecord | null;
    try {
      saved = await this.model.findOneAndUpdate(
        { ...claimFilter(userId, reserved), lastErrorCode: SUBSCRIBE_PENDING },
        { $set: { status: "connected", lastErrorCode: null } },
        { returnDocument: "after" }
      );
    } catch {
      await this.model.findOneAndUpdate(
        { ...claimFilter(userId, reserved), lastErrorCode: SUBSCRIBE_PENDING },
        { $set: { lastErrorCode: SUBSCRIBE_CONFIRM_FAILED } },
        { returnDocument: "after" }
      ).catch(() => undefined);
      throw connectionPersistenceError();
    }
    if (!saved) throw connectionStateError();
    const result = toResponse(saved);
    recordSettingHistorySafely({
      userId,
      actionType: "CONNECT_FACEBOOK_PAGE",
      actionTitle: "Kết nối Facebook Page",
      oldValue: toHistoryMetadata(existing),
      newValue: toHistoryMetadata(saved)
    });
    return result;
  }

  // Giữ reservation Page cũ cho đến khi Meta xác nhận đã ngắt, rồi mới CAS sang Page mới.
  private async reserveReplacement(
    userId: string,
    oldPage: FacebookPageConnectionRecord,
    values: ValidatedPageValues
  ): Promise<FacebookPageConnectionRecord | null> {
    const replacing = await this.model.findOneAndUpdate(
      claimFilter(userId, oldPage),
      { $set: { status: "invalid", lastErrorCode: REPLACE_PENDING } },
      { returnDocument: "after" }
    );
    if (!replacing) return null;
    const oldReservation = { ...replacing, encryptedPageAccessToken: oldPage.encryptedPageAccessToken };
    if (!oldPage.encryptedPageAccessToken) throw connectionPersistenceError();
    try {
      await this.messengerClient.unsubscribePage({
        pageId: oldPage.pageId,
        pageAccessToken: this.decrypt(oldPage.encryptedPageAccessToken)
      });
    } catch (error) {
      throw safeMessengerError(error, "UNSUBSCRIBE");
    }

    let reserved: FacebookPageConnectionRecord | null;
    try {
      reserved = await this.model.findOneAndUpdate(
        { ...claimFilter(userId, oldReservation), lastErrorCode: REPLACE_PENDING },
        { $set: { ...values, status: "invalid", lastErrorCode: SUBSCRIBE_PENDING } },
        { returnDocument: "after" }
      );
    } catch (error) {
      await this.restoreOldPage(userId, oldReservation);
      if (isPageDuplicate(error)) throw pageOwnershipError();
      throw connectionPersistenceError();
    }
    if (!reserved) {
      await this.restoreOldPage(userId, oldReservation);
      throw connectionStateError();
    }
    return { ...reserved, encryptedPageAccessToken: values.encryptedPageAccessToken };
  }

  // Khôi phục subscription cũ khi Page mới không thể giành ownership trong Mongo.
  private async restoreOldPage(userId: string, oldPage: FacebookPageConnectionRecord): Promise<void> {
    if (!oldPage.encryptedPageAccessToken) return;
    try {
      // Không gửi Meta khi CAS thất bại vì reservation đã mất.
      const stillOwned = await this.model.findOne({
        ...claimFilter(userId, oldPage), lastErrorCode: REPLACE_PENDING
      }).lean();
      if (!stillOwned) return;
      await this.messengerClient.subscribePage({
        pageId: oldPage.pageId,
        pageAccessToken: this.decrypt(oldPage.encryptedPageAccessToken)
      });
      await this.model.findOneAndUpdate(
        { ...claimFilter(userId, oldPage), lastErrorCode: REPLACE_PENDING },
        { $set: { status: "connected", lastErrorCode: null } },
        { returnDocument: "after" }
      );
    } catch {
      // Row invalid vẫn giữ Page claim để lần xử lý sau có thể khôi phục.
    }
  }

  async get(userId: string): Promise<FacebookPageConnectionResponse | null> {
    const connection = await this.model.findOne({ userId }).lean();
    return connection ? toResponse(connection) : null;
  }

  async remove(userId: string): Promise<void> {
    const existing = await this.model.findOne({ userId }).select("+encryptedPageAccessToken").lean();
    if (!existing) return;
    if (isTransition(existing) || existing.lastErrorCode === SUBSCRIBE_PENDING) throw connectionStateError();
    const removing = await this.model.findOneAndUpdate(
      claimFilter(userId, existing),
      { $set: { status: "invalid", lastErrorCode: REMOVE_PENDING } },
      { returnDocument: "after" }
    );
    if (!removing) throw connectionStateError();
    if (!existing.encryptedPageAccessToken) throw connectionPersistenceError();
    try {
      await this.messengerClient.unsubscribePage({
        pageId: existing.pageId,
        pageAccessToken: this.decrypt(existing.encryptedPageAccessToken)
      });
    } catch (error) {
      throw safeMessengerError(error, "UNSUBSCRIBE");
    }
    const deleted = await this.model.findOneAndDelete({
      ...claimFilter(userId, { ...removing, encryptedPageAccessToken: existing.encryptedPageAccessToken }),
      lastErrorCode: REMOVE_PENDING
    });
    if (!deleted) throw connectionStateError();
    recordSettingHistorySafely({
      userId,
      actionType: "DISCONNECT_FACEBOOK_PAGE",
      actionTitle: "Ngắt kết nối Facebook Page",
      oldValue: toHistoryMetadata(existing),
      newValue: {}
    });
  }
}

export const facebookPageService = new FacebookPageService();
