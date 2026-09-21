import { env } from "@nhuu-chat/config";

import { AppError } from "../common/errors.js";

type GraphFetch = (input: string, init?: RequestInit) => Promise<Response>;

export type FacebookPublisherInput = {
  pageId: string;
  pageAccessToken: string;
  message: string;
  mediaUrl?: string;
};

export type FacebookPublisherDependencies = {
  fetchGraph?: GraphFetch;
  graphApiVersion?: string;
  timeoutMs?: number;
};

function graphError(body: unknown): { code?: number; subcode?: number } {
  if (!body || typeof body !== "object") return {};
  const value = (body as { error?: unknown }).error;
  if (!value || typeof value !== "object") return {};
  const error = value as { code?: unknown; error_subcode?: unknown };
  return {
    ...(typeof error.code === "number" ? { code: error.code } : {}),
    ...(typeof error.error_subcode === "number" ? { subcode: error.error_subcode } : {})
  };
}

function safeError(code: string, message: string, statusCode: number): AppError {
  return new AppError(statusCode, code, message);
}

function isTimeout(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { name?: unknown; code?: unknown; message?: unknown };
  return value.name === "TimeoutError"
    || value.name === "AbortError"
    || value.code === "ETIMEDOUT"
    || (typeof value.message === "string" && value.message.toLowerCase().includes("timeout"));
}

function mapGraphFailure(response: Response, body: unknown): AppError {
  const { code, subcode } = graphError(body);
  if (code === 190 || response.status === 401) {
    return safeError("FACEBOOK_TOKEN_INVALID", "Facebook Page access token is invalid", 401);
  }
  if (code === 200 || code === 10 || code === 100) {
    return safeError("FACEBOOK_PERMISSION_DENIED", "Facebook Page publishing permission was denied", 403);
  }
  if (code === 4 || code === 17 || code === 32 || code === 613 || response.status === 429) {
    return safeError("FACEBOOK_RATE_LIMITED", "Facebook temporarily rate limited this publish", 429);
  }
  if (code === 803) {
    return safeError("FACEBOOK_PAGE_NOT_FOUND", "Facebook Page was not found", 404);
  }
  if (subcode === 324) {
    return safeError("FACEBOOK_MEDIA_REJECTED", "Facebook rejected the image", 422);
  }
  return safeError("FACEBOOK_PUBLISH_FAILED", "Facebook could not publish the post", 502);
}

export class FacebookPublisher {
  private readonly fetchGraph: GraphFetch;
  private readonly graphApiVersion: string;
  private readonly timeoutMs: number;

  constructor(dependencies: FacebookPublisherDependencies = {}) {
    this.fetchGraph = dependencies.fetchGraph ?? fetch;
    this.graphApiVersion = dependencies.graphApiVersion ?? env.META_GRAPH_API_VERSION;
    this.timeoutMs = dependencies.timeoutMs ?? 15_000;
  }

  // Gọi đúng endpoint theo loại bài và chỉ trả ID cần lưu, không đưa raw response ra ngoài.
  async publish(input: FacebookPublisherInput): Promise<{ publishedPostId: string }> {
    const endpoint = input.mediaUrl ? "photos" : "feed";
    const parameters = new URLSearchParams({
      access_token: input.pageAccessToken,
      ...(input.mediaUrl ? { caption: input.message, url: input.mediaUrl } : { message: input.message })
    });
    const url = `https://graph.facebook.com/${this.graphApiVersion}/${encodeURIComponent(input.pageId)}/${endpoint}`;

    let response: Response;
    let body: unknown;
    try {
      response = await this.fetchGraph(url, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: parameters,
        signal: AbortSignal.timeout(this.timeoutMs)
      });
      body = await response.json();
    } catch (error) {
      if (isTimeout(error)) {
        throw safeError("FACEBOOK_PUBLISH_TIMEOUT", "Facebook publish timed out", 504);
      }
      throw safeError("FACEBOOK_PUBLISH_FAILED", "Facebook publish failed", 502);
    }

    if (!response.ok) throw mapGraphFailure(response, body);
    const publishedPostId = body && typeof body === "object" ? (body as { id?: unknown }).id : undefined;
    if (typeof publishedPostId !== "string" || publishedPostId.length === 0) {
      throw safeError("FACEBOOK_PUBLISH_FAILED", "Facebook returned an invalid publish response", 502);
    }
    return { publishedPostId };
  }
}

export const facebookPublisher = new FacebookPublisher();
