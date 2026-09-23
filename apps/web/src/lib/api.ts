export async function apiRequest<T>(baseUrl: string, path: string, _token: string, init: RequestInit = {}, refresh?: () => Promise<string | null>): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    cache: init.cache ?? "no-store",
    credentials: "include",
    headers: { ...(init.body instanceof FormData ? {} : { "content-type": "application/json" }), ...init.headers }
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
