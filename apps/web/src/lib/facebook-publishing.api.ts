import type { FacebookPageConnectionResponse, FacebookPostResponse } from "@nhuu-chat/contracts";
import { resolveApiBaseUrl } from "./api-url.js";

const API_BASE_URL = resolveApiBaseUrl(import.meta.env.VITE_API_URL);

export class FacebookPublishingApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "FacebookPublishingApiError";
    this.code = code;
    this.status = status;
  }
}

type ErrorPayload = { error?: { code?: string; message?: string } };
type RequestOptions = { baseUrl?: string; signal?: AbortSignal };

const safeMessages: Record<string, string> = {
  FACEBOOK_PAGE_NOT_CONNECTED: "Chưa kết nối Facebook Page.",
  FACEBOOK_PAGE_TOKEN_INVALID: "Token Facebook Page không hợp lệ hoặc đã hết hạn.",
  FACEBOOK_PAGE_PERMISSION_DENIED: "Token không có quyền quản lý Facebook Page này.",
  FACEBOOK_PAGE_ID_MISMATCH: "Facebook Page không khớp với Page ID đã nhập.",
  FACEBOOK_PERMISSION_DENIED: "Facebook không cấp quyền đăng bài cho kết nối này.",
  FACEBOOK_TOKEN_INVALID: "Token Facebook không hợp lệ hoặc đã hết hạn.",
  FACEBOOK_PUBLISH_TIMEOUT: "Facebook chưa xác nhận kết quả đăng bài. Hãy kiểm tra lại trước khi thử lại.",
  FACEBOOK_POST_INVALID_STATE: "Bài viết không thể thực hiện thao tác ở trạng thái hiện tại.",
  FACEBOOK_POST_SCHEDULE_IN_PAST: "Thời gian hẹn đăng phải ở tương lai.",
  INVALID_ATTACHMENT: "Ảnh phải là JPEG, PNG hoặc WebP và không quá 5 MiB.",
  INVALID_REQUEST: "Thông tin gửi lên chưa hợp lệ.",
  FACEBOOK_PUBLISH_FAILED: "Facebook chưa thể đăng bài. Bạn có thể thử lại sau.",
  FACEBOOK_OAUTH_NOT_CONFIGURED: "Facebook OAuth chưa được cấu hình trên máy chủ.",
  FACEBOOK_OAUTH_STATE_INVALID: "Phiên đăng nhập Facebook đã hết hạn. Hãy thử lại.",
  FACEBOOK_OAUTH_CALLBACK_INVALID: "Phản hồi đăng nhập Facebook không hợp lệ.",
  FACEBOOK_OAUTH_FAILED: "Không thể đăng nhập Facebook. Hãy thử lại.",
  FACEBOOK_OAUTH_SELECTION_INVALID: "Danh sách Page đã hết hạn. Hãy đăng nhập Facebook lại.",
  FACEBOOK_OAUTH_PAGE_NOT_PUBLISHABLE: "Tài khoản Facebook không có quyền đăng bài trên Page này."
};

function endpoint(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

async function request<T>(path: string, init: RequestInit = {}, options: RequestOptions = {}, retryOnUnauthorized = true): Promise<T> {
  const response = await fetch(endpoint(options.baseUrl ?? API_BASE_URL, path), {
    ...init,
    cache: init.cache ?? "no-store",
    credentials: "include",
    signal: options.signal,
    headers: { ...(init.body instanceof FormData ? {} : { "content-type": "application/json" }), ...init.headers }
  });
  if (response.status === 401 && retryOnUnauthorized) {
    const refreshResponse = await fetch(endpoint(options.baseUrl ?? API_BASE_URL, "/api/v1/auth/refresh"), {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      signal: options.signal
    });
    if (refreshResponse.ok) return request<T>(path, init, options, false);
  }
  if (response.status === 204) return undefined as T;

  let body: unknown = null;
  try { body = await response.json(); } catch { /* safe fallback below */ }
  if (!response.ok) {
    const payload = body as ErrorPayload | null;
    const code = payload?.error?.code ?? "FACEBOOK_PUBLISHING_REQUEST_FAILED";
    const message = safeMessages[code] ?? "Không thể hoàn tất thao tác đăng bài Facebook.";
    throw new FacebookPublishingApiError(code, message, response.status);
  }
  return body as T;
}

export function getFacebookPageConnection(baseUrl?: string, signal?: AbortSignal): Promise<FacebookPageConnectionResponse> {
  return request<FacebookPageConnectionResponse>("/api/v1/facebook-page/connection", { method: "GET" }, { baseUrl, signal });
}

export function connectFacebookPage(input: { pageId: string; pageAccessToken: string }, baseUrl?: string): Promise<FacebookPageConnectionResponse> {
  return request<FacebookPageConnectionResponse>("/api/v1/facebook-page/connection", {
    method: "POST",
    body: JSON.stringify(input)
  }, { baseUrl });
}

export function removeFacebookPage(baseUrl?: string): Promise<void> {
  return request<void>("/api/v1/facebook-page/connection", { method: "DELETE" }, { baseUrl });
}

export function startFacebookOAuth(baseUrl?: string): Promise<{ authorizationUrl: string }> {
  return request<{ authorizationUrl: string }>("/api/v1/facebook-page/oauth/start", { method: "GET" }, { baseUrl });
}

export interface FacebookOAuthPage {
  id: string;
  name: string;
  canPublish: boolean;
}

export function listFacebookOAuthPages(selection: string, baseUrl?: string): Promise<FacebookOAuthPage[]> {
  return request<FacebookOAuthPage[]>(`/api/v1/facebook-page/oauth/pages?selection=${encodeURIComponent(selection)}`, { method: "GET" }, { baseUrl });
}

export function selectFacebookOAuthPage(selectionToken: string, pageId: string, baseUrl?: string): Promise<FacebookPageConnectionResponse> {
  return request<FacebookPageConnectionResponse>("/api/v1/facebook-page/oauth/select", {
    method: "POST",
    body: JSON.stringify({ selectionToken, pageId })
  }, { baseUrl });
}

export function listFacebookPosts(status?: FacebookPostResponse["status"], baseUrl?: string): Promise<FacebookPostResponse[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return request<FacebookPostResponse[]>(`/api/v1/facebook-page/posts${query}`, { method: "GET" }, { baseUrl });
}

function postFormData(input: { message?: string; mode?: "draft" | "now" | "scheduled"; scheduledAt?: string | null; image?: File | null }): FormData {
  const formData = new FormData();
  if (input.message !== undefined) formData.set("message", input.message);
  if (input.mode !== undefined) formData.set("mode", input.mode);
  if (input.scheduledAt !== undefined && input.scheduledAt !== null) formData.set("scheduledAt", input.scheduledAt);
  if (input.image) formData.set("image", input.image);
  return formData;
}

export function createFacebookPost(input: { message: string; mode: "draft" | "now" | "scheduled"; scheduledAt?: string; image?: File | null }, baseUrl?: string): Promise<FacebookPostResponse> {
  return request<FacebookPostResponse>("/api/v1/facebook-page/posts", { method: "POST", body: postFormData(input) }, { baseUrl });
}

export function updateFacebookPost(id: string, input: { message?: string; mode?: "draft" | "scheduled"; scheduledAt?: string | null; image?: File | null }, baseUrl?: string): Promise<FacebookPostResponse> {
  if (input.scheduledAt === null && !input.image) {
    return request<FacebookPostResponse>(`/api/v1/facebook-page/posts/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ ...input, scheduledAt: null }) }, { baseUrl });
  }
  // Multer cannot carry a JSON null. Draft mode is the backend's multipart-safe schedule-clear operation.
  const formData = postFormData(input.scheduledAt === null ? { ...input, mode: "draft", scheduledAt: undefined } : input);
  return request<FacebookPostResponse>(`/api/v1/facebook-page/posts/${encodeURIComponent(id)}`, { method: "PATCH", body: formData }, { baseUrl });
}

export function retryFacebookPost(id: string, mode: "now" | "scheduled", baseUrl?: string): Promise<FacebookPostResponse> {
  return request<FacebookPostResponse>(`/api/v1/facebook-page/posts/${encodeURIComponent(id)}/retry`, { method: "POST", body: JSON.stringify({ mode }) }, { baseUrl });
}

export function cancelFacebookPost(id: string, baseUrl?: string): Promise<void> {
  return request<void>(`/api/v1/facebook-page/posts/${encodeURIComponent(id)}`, { method: "DELETE" }, { baseUrl });
}
