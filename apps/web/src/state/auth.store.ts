export interface AuthState { accessToken: string; refreshToken: string; }
export function loadAuth(): AuthState | null { const raw = localStorage.getItem("nhuu-chat-auth"); return raw ? JSON.parse(raw) as AuthState : null; }
export function saveAuth(auth: AuthState) { localStorage.setItem("nhuu-chat-auth", JSON.stringify(auth)); }
