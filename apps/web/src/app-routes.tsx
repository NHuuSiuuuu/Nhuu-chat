import * as React from "react";
import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import type { AuthRoute } from "./components/auth/auth-route.js";
import { ProtectedRoute } from "./components/common/ProtectedRoute.js";

const privatePaths = [
  "/dashboard",
  "/inbox",
  "/telegram",
  "/settings/*",
  "/profile",
  "/posts",
  "/orders",
  "/analytics"
] as const;

export function ApplicationRoutes({
  isAuthenticated,
  isLoading,
  fallback,
  landing,
  authPages,
  privatePage
}: {
  isAuthenticated: boolean;
  isLoading: boolean;
  fallback: ReactNode;
  landing: ReactNode;
  authPages: Record<AuthRoute, ReactNode>;
  privatePage: ReactNode;
}) {
  return <Routes>
    <Route path="/" element={landing} />
    <Route path="/login" element={authPages.login} />
    <Route path="/register" element={authPages.register} />
    <Route path="/forgot-password" element={authPages["forgot-password"]} />
    <Route path="/reset-password" element={authPages["reset-password"]} />
    <Route element={<ProtectedRoute isAuthenticated={isAuthenticated} isLoading={isLoading} fallback={fallback} />}>
      {privatePaths.map((path) => <Route key={path} path={path} element={privatePage} />)}
      <Route path="*" element={<Navigate replace to="/dashboard" />} />
    </Route>
  </Routes>;
}
