import * as React from "react";
import type { ReactNode } from "react";
import { Navigate, Outlet } from "react-router-dom";

export function ProtectedRoute({
  isAuthenticated,
  isLoading,
  fallback
}: {
  isAuthenticated: boolean;
  isLoading: boolean;
  fallback?: ReactNode;
}) {
  if (isLoading) {
    return <>{fallback ?? <p role="status">Đang xác minh phiên đăng nhập...</p>}</>;
  }

  if (!isAuthenticated) return <Navigate replace to="/login" />;

  return <Outlet />;
}
