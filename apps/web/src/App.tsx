import * as React from "react";
import { Suspense, useCallback, useEffect, useState } from "react";
import { InboxPage } from "./pages/InboxPage.js";
import { conversationPathForPlatform, DashboardPage } from "./pages/DashboardPage.js";
import { TelegramPersonalPage } from "./pages/TelegramPersonalPage.js";
import { clearAuth, type AuthRole, type AuthState } from "./state/auth.store.js";
import { ProtectedRoute } from "./components/common/ProtectedRoute.js";
import { resolveApiBaseUrl } from "./lib/api-url.js";
import { canAccessInbox } from "./state/inbox-access.js";
import { SettingsPage } from "./pages/SettingsPage.js";
import { ProfilePage } from "./pages/ProfilePage.js";
import { DevelopmentPage, developmentPathForSection, developmentSectionFromPath, type DevelopmentSection } from "./pages/DevelopmentPage.js";
import { NetflixIntro } from "./components/NetflixIntro.js";
import { FacebookPublishingPage } from "./pages/FacebookPublishingPage.js";

const API_URL = resolveApiBaseUrl(import.meta.env.VITE_API_URL);

interface AuthResponse {
  user: { id: string; email: string; role: AuthRole };
}

type AppPage = "dashboard" | "telegram" | "inbox" | "settings" | "profile" | "development";
type RoutePage = AppPage | "posts";
type InboxPlatform = "telegram_personal" | "zalo_personal" | undefined;
type HeaderNavItem = "Hộp thư" | "Đơn hàng" | "Bài viết" | "Thống kê" | "Cài đặt";
const INBOX_PLATFORM_STORAGE_KEY = "nhuu-chat.inbox-platform";

function pageFromPath(pathname: string): RoutePage {
  if (pathname === "/inbox") return "inbox";
  if (pathname === "/telegram") return "telegram";
  if (pathname === "/settings" || pathname.startsWith("/settings/")) return "settings";
  if (pathname === "/profile") return "profile";
  if (pathname === "/posts") return "posts";
  if (pathname === "/orders" || pathname === "/posts" || pathname === "/analytics") return "development";
  return "dashboard";
}

function pathForPage(page: RoutePage, developmentSection?: DevelopmentSection): string {
  if (page === "inbox") return "/inbox";
  if (page === "telegram") return "/telegram";
  if (page === "settings") return "/settings";
  if (page === "profile") return "/profile";
  if (page === "posts") return "/posts";
  if (page === "development" && developmentSection) return developmentPathForSection(developmentSection);
  return "/dashboard";
}

function inboxPlatformFromLocation(): InboxPlatform {
  const value = new URLSearchParams(window.location.search).get("platform");
  if (value === "telegram_personal" || value === "zalo_personal") return value;
  try {
    const stored = window.sessionStorage.getItem(INBOX_PLATFORM_STORAGE_KEY);
    return stored === "telegram_personal" || stored === "zalo_personal" ? stored : undefined;
  } catch {
    return undefined;
  }
}

function persistInboxPlatform(platform: InboxPlatform): void {
  try {
    if (platform) window.sessionStorage.setItem(INBOX_PLATFORM_STORAGE_KEY, platform);
    else window.sessionStorage.removeItem(INBOX_PLATFORM_STORAGE_KEY);
  } catch {
    // Storage may be unavailable in privacy-restricted browsers; the in-memory state still works.
  }
}

function pathForInbox(platform?: InboxPlatform): string {
  return conversationPathForPlatform(platform);
}

export function preloadIntroDependencies(): Promise<void> {
  const fontsReady = typeof document !== "undefined" && document.fonts ? document.fonts.ready : Promise.resolve();
  return Promise.all([fontsReady]).then(() => undefined).catch(() => undefined);
}

function PageSkeleton() {
  return <main className="grid min-h-screen place-items-center bg-slate-100 p-6" role="status" aria-label="Đang tải giao diện"><div className="grid w-full max-w-3xl gap-4"><div className="h-12 w-48 animate-pulse rounded-lg bg-slate-200" /><div className="h-32 animate-pulse rounded-xl bg-white shadow-sm" /><div className="grid grid-cols-3 gap-4"><div className="h-24 animate-pulse rounded-xl bg-white" /><div className="h-24 animate-pulse rounded-xl bg-white" /><div className="h-24 animate-pulse rounded-xl bg-white" /></div></div></main>;
}

export function App() {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [page, setPage] = useState<RoutePage>(() => pageFromPath(window.location.pathname));
  const [inboxPlatform, setInboxPlatform] = useState<InboxPlatform>(() => inboxPlatformFromLocation());
  const [developmentSection, setDevelopmentSection] = useState<DevelopmentSection>(() => developmentSectionFromPath(window.location.pathname));
  const [showIntro, setShowIntro] = useState(true);
  const [introReady, setIntroReady] = useState(false);
  const navigate = useCallback((nextPage: RoutePage, platform?: InboxPlatform, nextDevelopmentSection?: DevelopmentSection) => {
    setPage(nextPage);
    if (nextPage === "inbox") {
      setInboxPlatform(platform);
      persistInboxPlatform(platform);
    }
    if (nextDevelopmentSection) setDevelopmentSection(nextDevelopmentSection);
    const nextPath = nextPage === "inbox" ? pathForInbox(platform) : pathForPage(nextPage, nextDevelopmentSection);
    if (`${window.location.pathname}${window.location.search}` !== nextPath) window.history.pushState({}, "", nextPath);
  }, []);
  useEffect(() => {
    const handlePopState = () => {
      const nextPage = pageFromPath(window.location.pathname);
      setPage(nextPage);
      if (nextPage === "inbox") setInboxPlatform(inboxPlatformFromLocation());
      setDevelopmentSection(developmentSectionFromPath(window.location.pathname));
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);
  useEffect(() => {
    let cancelled = false;
    void preloadIntroDependencies().finally(() => {
      if (!cancelled) setIntroReady(true);
    });
    return () => { cancelled = true; };
  }, []);
  const refresh = useCallback(async (): Promise<string | null> => {
    const response = await fetch(`${API_URL}/api/v1/auth/refresh`, { method: "POST", credentials: "include" });
    if (!response.ok) {
      clearAuth();
      setAuth(null);
      return null;
    }
    const body = await response.json() as AuthResponse;
    setAuth({ user: body.user });
    return "cookie-session";
  }, []);

  const loadSession = useCallback(async (): Promise<boolean> => {
    const sessionResponse = await fetch(`${API_URL}/api/v1/auth/session`, { method: "POST", credentials: "include" });
    if (sessionResponse.ok) {
      const body = await sessionResponse.json() as AuthResponse;
      setAuth({ user: body.user });
      return true;
    }
    if (!await refresh()) return false;
    const retryResponse = await fetch(`${API_URL}/api/v1/auth/session`, { method: "POST", credentials: "include" });
    if (!retryResponse.ok) return false;
    const body = await retryResponse.json() as AuthResponse;
    setAuth({ user: body.user });
    return true;
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    void loadSession().finally(() => {
      if (!cancelled) setAuthReady(true);
    });
    return () => { cancelled = true; };
  }, [loadSession]);
  let appContent: React.ReactNode;
  if (!authReady) {
    appContent = <PageSkeleton />;
  } else if (!auth) {
    appContent = <AuthPage onAuthenticated={(next) => setAuth({ user: next.user })} />;
  } else if (!canAccessInbox(auth.user.role)) {
    appContent = <main><h1>Nhuu Chat</h1><p>Tài khoản của anh đã đăng nhập nhưng chưa có quyền mở inbox. Hãy nhờ admin cấp role agent.</p><button onClick={() => { void fetch(`${API_URL}/api/v1/auth/logout`, { method: "POST", credentials: "include" }).finally(() => { clearAuth(); setAuth(null); }); }}>Đăng xuất</button></main>;
  } else {
    const logout = () => { persistInboxPlatform(undefined); void fetch(`${API_URL}/api/v1/auth/logout`, { method: "POST", credentials: "include" }).finally(() => { clearAuth(); setAuth(null); }); };
    const openProfile = () => navigate("profile");
    const navigateFromHeader = (item: HeaderNavItem) => {
      if (item === "Hộp thư") return navigate("inbox", inboxPlatform);
      if (item === "Cài đặt") return navigate("settings");
      if (item === "Bài viết") return navigate("posts");
      return navigate("development", undefined, item);
    };
    const topbarProps = { user: auth.user, onLogout: logout, onProfile: openProfile };
    appContent = <ProtectedRoute token="cookie-session">{page === "dashboard" ? <DashboardPage {...topbarProps} token="" refresh={refresh} onOpenInbox={(platform) => navigate("inbox", platform)} onLogoClick={() => navigate("dashboard")} onNavigate={navigateFromHeader} /> : page === "telegram" ? <TelegramPersonalPage token="" refresh={refresh} onBack={() => navigate("dashboard")} /> : page === "settings" ? <SettingsPage {...topbarProps} token="" refresh={refresh} onLogoClick={() => navigate("dashboard")} onNavigate={navigateFromHeader} /> : page === "profile" ? <ProfilePage {...topbarProps} token="" onLogoClick={() => navigate("dashboard")} onNavigate={navigateFromHeader} /> : page === "posts" ? <FacebookPublishingPage onBack={() => navigate("dashboard")} /> : page === "development" ? <DevelopmentPage {...topbarProps} section={developmentSection} onLogoClick={() => navigate("dashboard")} onNavigate={navigateFromHeader} /> : <InboxPage {...topbarProps} token="" platform={inboxPlatform} refresh={refresh} onBack={() => navigate("dashboard")} onLogoClick={() => navigate("dashboard")} onNavigate={navigateFromHeader} />}</ProtectedRoute>;
  }
  return <><Suspense fallback={<PageSkeleton />}>{appContent}</Suspense>{showIntro && <NetflixIntro ready={introReady} onComplete={() => setShowIntro(false)} />}</>;
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
        credentials: "include",
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

  return <main className="grid min-h-screen place-items-center bg-slate-100 px-4 py-10 text-slate-800" aria-labelledby="auth-title">
    <section className="w-full max-w-md rounded-2xl bg-white p-6 shadow-lg sm:p-8">
      <h1 id="auth-title" className="text-2xl font-bold text-slate-900">Nhuu Chat</h1>
      <p className="mt-2 text-sm text-slate-500">{mode === "login" ? "Đăng nhập để mở inbox." : "Tạo tài khoản mới để sử dụng hệ thống."}</p>
      <form className="mt-6 grid gap-4" onSubmit={submit}>
      {mode === "register" && <label className="grid gap-1.5 text-sm font-medium text-slate-700">Tên hiển thị<input className="rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100" value={name} onChange={(event) => setName(event.target.value)} required autoComplete="name" /></label>}
      <label className="grid gap-1.5 text-sm font-medium text-slate-700">Email<input className="rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" /></label>
      <label className="grid gap-1.5 text-sm font-medium text-slate-700">Mật khẩu<input className="rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} autoComplete={mode === "login" ? "current-password" : "new-password"} /></label>
      {error && <p className="text-sm text-rose-600" role="alert">{error}</p>}
      <button className="rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500" type="submit" disabled={submitting}>{submitting ? "Đang xử lý..." : mode === "login" ? "Đăng nhập" : "Đăng ký"}</button>
    </form>
    <button className="mt-5 text-sm font-medium text-sky-600 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500" type="button" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}>
      {mode === "login" ? "Chưa có tài khoản? Đăng ký" : "Đã có tài khoản? Đăng nhập"}
    </button></section>
  </main>;
}
