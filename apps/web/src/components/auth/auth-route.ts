export type AuthRoute = "login" | "register" | "forgot-password" | "reset-password";

export function authRouteFromPath(pathname: string): AuthRoute | null {
  if (pathname === "/login" || pathname === "/register" || pathname === "/forgot-password" || pathname === "/reset-password") {
    return pathname.slice(1) as AuthRoute;
  }
  return null;
}

export function authenticatedAuthRedirect(isAuthenticated: boolean, pathname: string): string | null {
  const route = authRouteFromPath(pathname);
  return isAuthenticated && route && route !== "reset-password" ? "/dashboard" : null;
}
