export const ACTIVE_WORKSPACE_USER_STORAGE_KEY = "nhuu-chat.active-workspace-user";

export function activeWorkspaceStorageKey(userId: string): string {
  return `nhuu-chat.active-workspace:${userId}`;
}

export function getActiveWorkspaceIdForUser(userId: string): string | null {
  return typeof localStorage === "undefined" ? null : localStorage.getItem(activeWorkspaceStorageKey(userId));
}

export function setActiveWorkspaceSelection(userId: string, workspaceId: string): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(activeWorkspaceStorageKey(userId), workspaceId);
  setActiveWorkspaceUser(userId);
}

export function setActiveWorkspaceUser(userId: string): void {
  if (typeof localStorage !== "undefined") localStorage.setItem(ACTIVE_WORKSPACE_USER_STORAGE_KEY, userId);
}

export function getActiveWorkspaceId(): string | null {
  if (typeof localStorage === "undefined") return null;
  const userId = localStorage.getItem(ACTIVE_WORKSPACE_USER_STORAGE_KEY);
  return userId ? getActiveWorkspaceIdForUser(userId) : null;
}

export async function apiRequest<T>(baseUrl: string, path: string, _token: string, init: RequestInit = {}, refresh?: () => Promise<string | null>): Promise<T> {
  const workspaceId = getActiveWorkspaceId();
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    cache: init.cache ?? "no-store",
    credentials: "include",
    headers: { ...(init.body instanceof FormData ? {} : { "content-type": "application/json" }), ...(workspaceId ? { "x-workspace-id": workspaceId } : {}), ...init.headers }
  });
  if (response.status === 401 && refresh) {
    const refreshed = await refresh();
    if (refreshed) return apiRequest<T>(baseUrl, path, "", init);
  }
  if (!response.ok) {
    let code: string | undefined;
    try {
      const body = await response.clone().json() as { error?: { code?: unknown } };
      if (typeof body.error?.code === "string") code = body.error.code;
    } catch { /* Keep the generic status error when the response is not JSON. */ }
    throw Object.assign(new Error(`API request failed: ${response.status}`), { code, status: response.status });
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
