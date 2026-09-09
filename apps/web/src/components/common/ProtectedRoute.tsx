import type { ReactNode } from "react";
export function ProtectedRoute({ token, children }: { token: string | null; children: ReactNode }) {
  return token ? <>{children}</> : <p role="alert">Vui lòng đăng nhập để mở inbox.</p>;
}
