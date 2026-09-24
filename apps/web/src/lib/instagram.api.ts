import type { InstagramConnectionListResponse, InstagramDisconnectResponse, InstagramOAuthStartResponse } from "@nhuu-chat/contracts";

import { resolveApiBaseUrl } from "./api-url.js";
import { getActiveWorkspaceId } from "./api.js";

const API_BASE_URL = resolveApiBaseUrl(import.meta.env.VITE_API_URL);

export class InstagramApiError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super("Instagram request failed");
    this.name = "InstagramApiError";
  }
}

async function request<T>(path: string, method: "GET" | "DELETE", baseUrl = API_BASE_URL, retry = true): Promise<T> {
  const workspaceId = getActiveWorkspaceId();
  const root = baseUrl.replace(/\/$/, "");
  const response = await fetch(`${root}${path}`, { method, credentials: "include", cache: "no-store", headers: workspaceId ? { "x-workspace-id": workspaceId } : {} });
  if (response.status === 401 && retry) {
    const refresh = await fetch(`${root}/api/v1/auth/refresh`, { method: "POST", credentials: "include", cache: "no-store" });
    if (refresh.ok) return request<T>(path, method, baseUrl, false);
  }
  let body: unknown = null;
  try { body = await response.json(); } catch { /* Phản hồi lỗi có thể không chứa JSON. */ }
  if (!response.ok) {
    const error = body && typeof body === "object" ? (body as { error?: { code?: unknown } }).error : undefined;
    throw new InstagramApiError(typeof error?.code === "string" ? error.code : "INSTAGRAM_REQUEST_FAILED", response.status);
  }
  return body as T;
}

export function startInstagramOAuth(baseUrl?: string): Promise<InstagramOAuthStartResponse> {
  return request("/api/v1/instagram/oauth/start", "GET", baseUrl);
}

export async function getInstagramConnections(baseUrl?: string): Promise<InstagramConnectionListResponse["connections"]> {
  return (await request<InstagramConnectionListResponse>("/api/v1/instagram/connections", "GET", baseUrl)).connections;
}

export function removeInstagramConnection(connectionId: string, baseUrl?: string): Promise<InstagramDisconnectResponse> {
  return request(`/api/v1/instagram/connections/${encodeURIComponent(connectionId)}`, "DELETE", baseUrl);
}
