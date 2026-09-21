import type { FacebookPageConnectionResponse } from "@nhuu-chat/contracts";

import { encryptSecret } from "../common/crypto.js";
import { AppError } from "../common/errors.js";
import { FacebookPageConnectionModel } from "../models/facebook-page-connection.model.js";

type GraphFetch = (input: string, init?: RequestInit) => Promise<Response>;

interface FacebookPageConnectionRecord {
  _id: unknown;
  pageId: string;
  pageName?: string | null;
  status: "connected" | "invalid";
  lastValidatedAt?: Date | null;
  lastErrorCode?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface ConnectionModel {
  findOne(filter: { userId: string }): { lean(): Promise<FacebookPageConnectionRecord | null> };
  findOneAndUpdate(filter: { userId: string }, update: Record<string, unknown>, options: Record<string, unknown>): Promise<FacebookPageConnectionRecord>;
  deleteOne(filter: { userId: string }): Promise<unknown>;
}

export interface FacebookPageServiceDependencies {
  model?: ConnectionModel;
  fetchGraph?: GraphFetch;
  encryptSecret?: (value: string) => string;
  graphApiVersion?: string;
}

function stringId(value: unknown): string {
  return typeof value === "string" ? value : String(value);
}

function toResponse(record: FacebookPageConnectionRecord): FacebookPageConnectionResponse {
  return {
    id: stringId(record._id),
    pageId: record.pageId,
    pageName: record.pageName ?? null,
    status: record.status,
    lastValidatedAt: record.lastValidatedAt?.toISOString() ?? null,
    lastErrorCode: record.lastErrorCode ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

function graphErrorCode(body: unknown): number | undefined {
  if (!body || typeof body !== "object") return undefined;
  const error = (body as { error?: unknown }).error;
  if (!error || typeof error !== "object") return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "number" ? code : undefined;
}

export class FacebookPageService {
  private readonly model: ConnectionModel;
  private readonly fetchGraph: GraphFetch;
  private readonly encrypt: (value: string) => string;
  private readonly graphApiVersion: string;

  constructor(dependencies: FacebookPageServiceDependencies = {}) {
    this.model = dependencies.model ?? FacebookPageConnectionModel;
    this.fetchGraph = dependencies.fetchGraph ?? fetch;
    this.encrypt = dependencies.encryptSecret ?? encryptSecret;
    this.graphApiVersion = dependencies.graphApiVersion ?? "v26.0";
  }

  async connect(userId: string, input: { pageId: string; pageAccessToken: string }): Promise<FacebookPageConnectionResponse> {
    const url = new URL(`https://graph.facebook.com/${this.graphApiVersion}/${encodeURIComponent(input.pageId)}`);
    url.searchParams.set("fields", "id,name");
    url.searchParams.set("access_token", input.pageAccessToken);

    let response: Response;
    let body: unknown;
    try {
      response = await this.fetchGraph(url.toString(), { method: "GET" });
      body = await response.json();
    } catch {
      throw new AppError(503, "FACEBOOK_GRAPH_UNAVAILABLE", "Facebook Graph API is temporarily unavailable");
    }

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
    const saved = await this.model.findOneAndUpdate(
      { userId },
      {
        $set: {
          pageId: input.pageId,
          pageName: typeof metadata.name === "string" ? metadata.name : null,
          encryptedPageAccessToken,
          status: "connected",
          lastValidatedAt: new Date(),
          lastErrorCode: null
        },
        $setOnInsert: { userId, platform: "facebook" }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return toResponse(saved);
  }

  async get(userId: string): Promise<FacebookPageConnectionResponse | null> {
    const connection = await this.model.findOne({ userId }).lean();
    return connection ? toResponse(connection) : null;
  }

  async remove(userId: string): Promise<void> {
    await this.model.deleteOne({ userId });
  }
}

export const facebookPageService = new FacebookPageService();
