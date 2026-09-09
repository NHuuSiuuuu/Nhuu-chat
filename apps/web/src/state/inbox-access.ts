import type { AuthRole } from "./auth.store.js";

export function canAccessInbox(role: AuthRole): boolean {
  return role === "admin" || role === "agent" || role === "customer";
}
