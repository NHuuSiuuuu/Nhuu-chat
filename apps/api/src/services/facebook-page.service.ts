import type { FacebookPageConnectionResponse } from "@nhuu-chat/contracts";
import { env } from "@nhuu-chat/config";

import { encryptSecret } from "../common/crypto.js";
import { AppError } from "../common/errors.js";
import { FacebookPageConnectionModel } from "../models/facebook-page-connection.model.js";
import { recordSettingHistory } from "./setting-history.service.js";

const FACEBOOK_GRAPH_REQUEST_TIMEOUT_MS = 10_000;

type GraphFetch = (input: string, init?: RequestInit) => Promise<Response>;

interface FacebookPageConnectionRecord {
  _id: unknown;
  userId?: unknown;
  pageId: string;
  pageName?: string | null;
  avatarUrl?: string | null;
  status: "connected" | "invalid";
  lastValidatedAt?: Date | null;
  lastErrorCode?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface ConnectionModel {
  findOne(filter: Record<string, unknown>): { lean(): Promise<FacebookPageConnectionRecord | null> };
  findOneAndUpdate(filter: Record<string, unknown>, update: Record<string, unknown>, options: Record<string, unknown>): Promise<FacebookPageConnectionRecord | null>;
  create(input: Record<string, unknown>): Promise<FacebookPageConnectionRecord>;
  findOneAndDelete(filter: { userId: string }): Promise<FacebookPageConnectionRecord | null>;
}

export interface FacebookPageServiceDependencies {
  model?: ConnectionModel;
  fetchGraph?: GraphFetch;
  encryptSecret?: (value: string) => string;
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
  private readonly graphApiVersion: string;
  private readonly graphRequestTimeoutMs: number;

  constructor(dependencies: FacebookPageServiceDependencies = {}) {
    this.model = dependencies.model ?? FacebookPageConnectionModel;
    this.fetchGraph = dependencies.fetchGraph ?? fetch;
    this.encrypt = dependencies.encryptSecret ?? encryptSecret;
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

    // Conversations API requires Messenger access for the Page token and is safe to probe without sending a message.
    const conversationsUrl = new URL(`https://graph.facebook.com/${this.graphApiVersion}/${encodeURIComponent(input.pageId)}/conversations`);
    conversationsUrl.searchParams.set("limit", "1");
    conversationsUrl.searchParams.set("access_token", input.pageAccessToken);
    const capability = await fetchGraphResponse(this.fetchGraph, conversationsUrl, this.graphRequestTimeoutMs);
    if (!capability.response.ok || graphErrorCode(capability.body) !== undefined) {
      const code = graphErrorCode(capability.body);
      if (code === 190 || capability.response.status === 401) {
        throw new AppError(401, "FACEBOOK_PAGE_TOKEN_INVALID", "Facebook Page access token is invalid");
      }
      if (code === 10 || code === 200 || capability.response.status === 403) {
        throw new AppError(403, "FACEBOOK_PAGE_MESSAGING_PERMISSION_MISSING", "Facebook Page messaging permission is missing");
      }
      throw new AppError(400, "FACEBOOK_PAGE_VALIDATION_FAILED", "Facebook Page credentials could not be validated");
    }
    if (!capability.body || typeof capability.body !== "object" || !Array.isArray((capability.body as { data?: unknown }).data)) {
      throw new AppError(400, "FACEBOOK_PAGE_VALIDATION_FAILED", "Facebook Page credentials could not be validated");
    }

    const encryptedPageAccessToken = this.encrypt(input.pageAccessToken);
    const values = {
      pageId: input.pageId,
      pageName: typeof metadata.name === "string" ? metadata.name : null,
      avatarUrl: graphPictureUrl(body),
      encryptedPageAccessToken,
      status: "connected",
      lastValidatedAt: new Date(),
      lastErrorCode: null
    };
    let existing: FacebookPageConnectionRecord | null;
    let saved: FacebookPageConnectionRecord;
    // Chỉ ghi khi toàn bộ metadata audit còn khớp; đọc lại nếu kết nối bị thay hoặc xóa.
    for (;;) {
      existing = await this.model.findOne({ userId }).lean();
      // Từ chối Page đã thuộc owner khác trước khi ghi để bảo vệ dữ liệu khi index đang được triển khai.
      const otherOwner = await this.model.findOne({ pageId: input.pageId, userId: { $ne: userId } }).lean();
      if (otherOwner && (otherOwner.userId === undefined || stringId(otherOwner.userId) !== userId)) {
        throw pageOwnershipError();
      }
      if (existing) {
        let updated: FacebookPageConnectionRecord | null;
        try {
          updated = await this.model.findOneAndUpdate(
            { userId, _id: existing._id, ...toHistoryMetadata(existing) },
            { $set: values },
            { returnDocument: "after" }
          );
        } catch (error) {
          if (isPageDuplicate(error)) throw pageOwnershipError();
          throw error;
        }
        if (!updated) continue;
        saved = updated;
        break;
      }
      try {
        saved = await this.model.create({ userId, platform: "facebook", ...values });
        break;
      } catch (error) {
        if (isPageDuplicate(error)) throw pageOwnershipError();
        // Index userId duy nhất phân xử hai lần kết nối đầu tiên; lỗi khác vẫn được trả về.
        const conflict = error as { code?: number; keyPattern?: { userId?: number } } | null;
        if (conflict?.code !== 11000 || conflict.keyPattern?.userId !== 1) throw error;
      }
    }
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

  async get(userId: string): Promise<FacebookPageConnectionResponse | null> {
    const connection = await this.model.findOne({ userId }).lean();
    return connection ? toResponse(connection) : null;
  }

  async remove(userId: string): Promise<void> {
    const existing = await this.model.findOneAndDelete({ userId });
    if (!existing) return;
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
