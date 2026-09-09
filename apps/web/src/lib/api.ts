export async function apiRequest<T>(baseUrl: string, path: string, token: string, init: RequestInit = {}, refresh?: () => Promise<string | null>): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...init.headers }
  });
  if (response.status === 401 && refresh) {
    const refreshedToken = await refresh();
    if (refreshedToken) return apiRequest<T>(baseUrl, path, refreshedToken, init);
  }
  if (!response.ok) throw new Error(`API request failed: ${response.status}`);
  return response.json() as Promise<T>;
}
