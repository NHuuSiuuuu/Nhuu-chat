export type AuthRole = "admin" | "agent" | "customer";
export interface AuthState {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; role: AuthRole };
}

export function loadAuth(): AuthState | null {
  const raw = localStorage.getItem("nhuu-chat-auth");
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<AuthState>;
    if (!parsed.accessToken || !parsed.refreshToken || !parsed.user) return null;
    return parsed as AuthState;
  } catch {
    localStorage.removeItem("nhuu-chat-auth");
    return null;
  }
}

export function saveAuth(auth: AuthState) { localStorage.setItem("nhuu-chat-auth", JSON.stringify(auth)); }
export function clearAuth() { localStorage.removeItem("nhuu-chat-auth"); }
