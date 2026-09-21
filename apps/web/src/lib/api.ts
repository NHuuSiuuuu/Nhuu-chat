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
  if (!response.ok) throw new Error(`API request failed: ${response.status}`);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
