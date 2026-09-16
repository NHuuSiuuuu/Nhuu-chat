export async function apiRequest<T>(baseUrl: string, path: string, token: string, init: RequestInit = {}, refresh?: () => Promise<string | null>): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    cache: init.cache ?? "no-store",
    headers: { ...(init.body instanceof FormData ? {} : { "content-type": "application/json" }), ...(token ? { authorization: `Bearer ${token}` } : {}), ...init.headers }
  });
  if (response.status === 401 && refresh) {
    const refreshedToken = await refresh();
    if (refreshedToken) return apiRequest<T>(baseUrl, path, refreshedToken, init);
  }
  if (!response.ok) throw new Error(`API request failed: ${response.status}`);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
