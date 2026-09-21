export type AuthRole = "admin" | "agent" | "customer";
export interface AuthState {
  user: { id: string; email: string; role: AuthRole };
}

export function loadAuth(): AuthState | null { return null; }
export function saveAuth(_auth: AuthState): void { /* Phiên được giữ bằng HttpOnly cookie ở backend. */ }
export function clearAuth(): void { /* Cookie được thu hồi qua endpoint logout. */ }
