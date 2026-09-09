import * as React from "react";
import { useCallback, useState } from "react";
import { InboxPage } from "./pages/InboxPage.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { TelegramPersonalPage } from "./pages/TelegramPersonalPage.js";
import { clearAuth, loadAuth, saveAuth, type AuthRole } from "./state/auth.store.js";
import { ProtectedRoute } from "./components/common/ProtectedRoute.js";
import { resolveApiBaseUrl } from "./lib/api-url.js";
import { canAccessInbox } from "./state/inbox-access.js";

const API_URL = resolveApiBaseUrl(import.meta.env.VITE_API_URL);

interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; role: AuthRole };
}

export function App() {
  const [auth, setAuth] = useState(loadAuth());
  const [page, setPage] = useState<"dashboard" | "telegram" | "inbox">("dashboard");
  const refresh = useCallback(async () => {
    if (!auth) return null;
    const response = await fetch(`${API_URL}/api/v1/auth/refresh`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ refreshToken: auth.refreshToken }) });
    if (!response.ok) { clearAuth(); setAuth(null); return null; }
    const tokens = await response.json() as { accessToken: string; refreshToken: string };
    const next = { ...auth, ...tokens };
    saveAuth(next);
    setAuth(next);
    return next.accessToken;
  }, [auth]);
  if (!auth) return <AuthPage onAuthenticated={(next) => { saveAuth(next); setAuth(next); }} />;
  if (!canAccessInbox(auth.user.role)) {
    return <main><h1>Nhuu Chat</h1><p>Tài khoản của anh đã đăng nhập nhưng chưa có quyền mở inbox. Hãy nhờ admin cấp role agent.</p><button onClick={() => { clearAuth(); setAuth(null); }}>Đăng xuất</button></main>;
  }
  return <ProtectedRoute token={auth.accessToken}>{page === "dashboard" ? <DashboardPage token={auth.accessToken} refresh={refresh} onOpenInbox={() => setPage("inbox")} /> : page === "telegram" ? <TelegramPersonalPage token={auth.accessToken} refresh={refresh} onBack={() => setPage("dashboard")} /> : <InboxPage token={auth.accessToken} refresh={refresh} onBack={() => setPage("dashboard")} />}</ProtectedRoute>;
}

function AuthPage({ onAuthenticated }: { onAuthenticated: (auth: AuthResponse) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/api/v1/auth/${mode}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), password })
      });
      const body = await response.json() as AuthResponse & { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "Không thể xác thực tài khoản");
      onAuthenticated(body);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Không thể kết nối máy chủ");
    } finally {
      setSubmitting(false);
    }
  }

  return <main aria-labelledby="auth-title">
    <h1 id="auth-title">Nhuu Chat</h1>
    <p>{mode === "login" ? "Đăng nhập để mở inbox." : "Tạo tài khoản mới để sử dụng hệ thống."}</p>
    <form onSubmit={submit}>
      {mode === "register" && <label>Tên hiển thị<input value={name} onChange={(event) => setName(event.target.value)} required autoComplete="name" /></label>}
      <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" /></label>
      <label>Mật khẩu<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} autoComplete={mode === "login" ? "current-password" : "new-password"} /></label>
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={submitting}>{submitting ? "Đang xử lý..." : mode === "login" ? "Đăng nhập" : "Đăng ký"}</button>
    </form>
    <button type="button" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}>
      {mode === "login" ? "Chưa có tài khoản? Đăng ký" : "Đã có tài khoản? Đăng nhập"}
    </button>
  </main>;
}
