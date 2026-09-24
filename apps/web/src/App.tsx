import * as React from "react";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { toast, Toaster } from "sonner";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { chatEvents, type ChatMessageContract } from "@nhuu-chat/contracts";
import { createChatSocket } from "./lib/socket.js";
import { loadGeneralSettings } from "./components/settings/general-settings.js";
import { InboxPage } from "./pages/InboxPage.js";
import { conversationPathForPlatform, DashboardPage } from "./pages/DashboardPage.js";
import { TelegramPersonalPage } from "./pages/TelegramPersonalPage.js";
import { clearAuth, type AuthRole, type AuthState } from "./state/auth.store.js";
import { ApplicationRoutes } from "./app-routes.js";
import { resolveApiBaseUrl } from "./lib/api-url.js";
import { fetchJsonWithTimeout } from "./lib/fetch-with-timeout.js";
import { canAccessInbox } from "./state/inbox-access.js";
import { aboutPathForSection, mobileAboutSections, mobileSettingsItems, settingsPathForItem, SettingsPage } from "./pages/SettingsPage.js";
import { ProfilePage } from "./pages/ProfilePage.js";
import { DevelopmentPage, developmentPathForSection, developmentSectionFromPath, type DevelopmentSection } from "./pages/DevelopmentPage.js";
import { NetflixIntro } from "./components/NetflixIntro.js";
import { FacebookPublishingPage } from "./pages/FacebookPublishingPage.js";
import { LandingPage } from "./components/landing/LandingPage.js";
import { AuthRoutePage } from "./components/auth/AuthRoutePage.js";
import { authRouteFromPath, authenticatedAuthRedirect, type AuthRoute } from "./components/auth/auth-route.js";
import { getActiveWorkspaceIdForUser, setActiveWorkspaceSelection, setActiveWorkspaceUser } from "./lib/api.js";
import { WorkspacePickerProvider, type WorkspaceOption, type WorkspacePickerState } from "./components/dashboard/workspace-picker-context.js";

const API_URL = resolveApiBaseUrl(import.meta.env.VITE_API_URL);
const AUTH_REQUEST_TIMEOUT_MS = 8_000;

interface AuthResponse {
  user: { id: string; email: string; role: AuthRole };
}

type AppPage = "landing" | "dashboard" | "telegram" | "inbox" | "settings" | "profile" | "development";
type RoutePage = AppPage | "posts" | AuthRoute;
type InboxPlatform = "telegram_personal" | "zalo_personal" | `facebook:${string}` | undefined;
type HeaderNavItem = "Hộp thư" | "Đơn hàng" | "Bài viết" | "Thống kê" | "Cài đặt";
const INBOX_PLATFORM_STORAGE_KEY = "nhuu-chat.inbox-platform";

export function pageFromPath(pathname: string): RoutePage {
  if (pathname === "/") return "landing";
  const authRoute = authRouteFromPath(pathname);
  if (authRoute) return authRoute;
  if (pathname === "/inbox") return "inbox";
  if (pathname === "/telegram") return "telegram";
  if (pathname === "/settings" || pathname.startsWith("/settings/")) return "settings";
  if (pathname === "/profile") return "profile";
  if (pathname === "/posts") return "posts";
  // The old development branch was `if (pathname === "/orders" || pathname === "/posts" || pathname === "/analytics") return "development"`; /posts now has its own page.
  if (pathname === "/orders" || pathname === "/analytics") return "development";
  return "dashboard";
}

function isAuthPage(page: RoutePage): page is AuthRoute {
  return page === "login" || page === "register" || page === "forgot-password" || page === "reset-password";
}

export function shouldRenderIntro(showIntro: boolean, page: RoutePage, authReady = true): boolean {
  return showIntro && (!authReady || !isAuthPage(page));
}

function pathForPage(page: RoutePage, developmentSection?: DevelopmentSection): string {
  if (page === "landing") return "/";
  if (isAuthPage(page)) return `/${page}`;
  if (page === "inbox") return "/inbox";
  if (page === "telegram") return "/telegram";
  if (page === "settings") return "/settings";
  if (page === "profile") return "/profile";
  if (page === "posts") return "/posts";
  if (page === "development" && developmentSection) return developmentPathForSection(developmentSection);
  return "/dashboard";
}

export function getRouteTitle(route: string): string {
  const titles: Record<RoutePage, string> = {
    landing: "NhuuChat - Quản lý tin nhắn đa kênh",
    login: "Đăng nhập - NhuuChat",
    register: "Đăng ký - NhuuChat",
    "forgot-password": "Quên mật khẩu - NhuuChat",
    "reset-password": "Đặt lại mật khẩu - NhuuChat",
    dashboard: "Bảng điều khiển - NhuuChat",
    inbox: "Hộp thư - NhuuChat",
    settings: "Cài đặt - NhuuChat",
    posts: "Bài viết - NhuuChat",
    profile: "Hồ sơ - NhuuChat",
    telegram: "Telegram - NhuuChat",
    development: "Đang phát triển - NhuuChat"
  };
  return titles[route as RoutePage] ?? titles.dashboard;
}

function inboxPlatformFromLocation(search: string): InboxPlatform {
  const params = new URLSearchParams(search);
  const value = params.get("platform");
  if (value === "telegram_personal" || value === "zalo_personal") return value;
  const channelId = value === "facebook" ? params.get("channelId")?.trim() : undefined;
  if (channelId) return `facebook:${channelId}`;
  try {
    const stored = window.sessionStorage.getItem(INBOX_PLATFORM_STORAGE_KEY);
    if (stored === "telegram_personal" || stored === "zalo_personal") return stored;
    return stored?.startsWith("facebook:") && stored.length > "facebook:".length
      ? stored as `facebook:${string}`
      : undefined;
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
  const location = useLocation();
  const routerNavigate = useNavigate();
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [sessionUnavailable, setSessionUnavailable] = useState(false);
  const [sessionRetryCount, setSessionRetryCount] = useState(0);
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState("");
  const [workspacesLoaded, setWorkspacesLoaded] = useState(false);
  const [workspaceLoadFailed, setWorkspaceLoadFailed] = useState(false);
  const page = pageFromPath(location.pathname);
  const developmentSection = developmentSectionFromPath(location.pathname);
  const [inboxPlatform, setInboxPlatform] = useState<InboxPlatform>(() => inboxPlatformFromLocation(location.search));
  const [requestedConversation, setRequestedConversation] = useState<{ id: string; request: number } | null>(() => {
    const id = new URLSearchParams(location.search).get("conversationId");
    return id ? { id, request: 0 } : null;
  });
  const incomingNavigationRequestRef = useRef(0);
  const [showIntro, setShowIntro] = useState(true);
  const [introDependenciesReady, setIntroDependenciesReady] = useState(false);
  const introReady = introDependenciesReady && authReady;
  const navigate = useCallback((nextPage: RoutePage, platform?: InboxPlatform, nextDevelopmentSection?: DevelopmentSection) => {
    if (nextPage === "inbox") {
      setInboxPlatform(platform);
      persistInboxPlatform(platform);
    }
    const nextPath = nextPage === "inbox" ? pathForInbox(platform) : pathForPage(nextPage, nextDevelopmentSection);
    if (`${location.pathname}${location.search}` !== nextPath) routerNavigate(nextPath);
  }, [location.pathname, location.search, routerNavigate]);
  const navigateAuth = useCallback((route: AuthRoute) => {
    if (location.pathname !== `/${route}`) routerNavigate(`/${route}`);
  }, [location.pathname, routerNavigate]);
  // Ghi yêu cầu mở chat vào state để toast luôn chọn đúng hội thoại, kể cả khi Inbox đã đang mở.
  const navigateToIncomingConversation = useCallback((message: ChatMessageContract) => {
    const platform: InboxPlatform = message.platform === "telegram_personal" || message.platform === "zalo_personal"
      ? message.platform
      : undefined;
    setInboxPlatform(platform);
    setRequestedConversation({ id: message.conversationId, request: ++incomingNavigationRequestRef.current });
    persistInboxPlatform(platform);
    const params = new URLSearchParams();
    if (platform) params.set("platform", platform);
    params.set("conversationId", message.conversationId);
    routerNavigate(`/inbox?${params.toString()}`);
  }, [routerNavigate]);
  const completePasswordReset = useCallback(() => {
    clearAuth();
    setAuth(null);
    navigateAuth("login");
  }, [navigateAuth]);
  useEffect(() => {
    if (page !== "inbox") return;
    setInboxPlatform(inboxPlatformFromLocation(location.search));
    const conversationId = new URLSearchParams(location.search).get("conversationId");
    setRequestedConversation(conversationId ? { id: conversationId, request: ++incomingNavigationRequestRef.current } : null);
  }, [location.key, location.pathname, location.search, page]);
  useEffect(() => {
    document.title = getRouteTitle(page);
  }, [page]);
  useEffect(() => {
    if (authReady && isAuthPage(page)) setShowIntro(false);
  }, [authReady, page]);
  useEffect(() => {
    const redirectPath = authenticatedAuthRedirect(authReady && Boolean(auth), location.pathname);
    if (redirectPath) {
      routerNavigate(redirectPath, { replace: true });
    }
  }, [auth, authReady, location.pathname, routerNavigate]);
  useEffect(() => {
    let cancelled = false;
    void preloadIntroDependencies().finally(() => {
      if (!cancelled) setIntroDependenciesReady(true);
    });
    return () => { cancelled = true; };
  }, []);
  const refresh = useCallback(async (signal?: AbortSignal): Promise<string | null> => {
    const { response, body } = await fetchJsonWithTimeout<AuthResponse>(`${API_URL}/api/v1/auth/refresh`, { method: "POST", credentials: "include" }, AUTH_REQUEST_TIMEOUT_MS, signal);
    if (!response.ok) {
      clearAuth();
      setAuth(null);
      return null;
    }
    setAuth({ user: body.user });
    return "cookie-session";
  }, []);

  const loadSession = useCallback(async (signal?: AbortSignal): Promise<boolean> => {
    const { response: sessionResponse, body: sessionBody } = await fetchJsonWithTimeout<AuthResponse>(`${API_URL}/api/v1/auth/session`, { method: "POST", credentials: "include" }, AUTH_REQUEST_TIMEOUT_MS, signal);
    if (sessionResponse.ok) {
      setAuth({ user: sessionBody.user });
      return true;
    }
    if (!await refresh(signal)) return false;
    const { response: retryResponse, body: retryBody } = await fetchJsonWithTimeout<AuthResponse>(`${API_URL}/api/v1/auth/session`, { method: "POST", credentials: "include" }, AUTH_REQUEST_TIMEOUT_MS, signal);
    if (!retryResponse.ok) return false;
    setAuth({ user: retryBody.user });
    return true;
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    void loadSession(controller.signal).catch(() => {
      if (!cancelled) {
        clearAuth();
        setAuth(null);
        setSessionUnavailable(true);
      }
    }).finally(() => {
      if (!cancelled) setAuthReady(true);
    });
    return () => {
      cancelled = true;
      controller.abort(new DOMException("Auth bootstrap was cancelled", "AbortError"));
    };
  }, [loadSession, sessionRetryCount]);
  useEffect(() => {
    if (!authReady || !auth) {
      setWorkspaces([]);
      setActiveWorkspaceId("");
      setWorkspacesLoaded(false);
      setWorkspaceLoadFailed(false);
      return;
    }
    setWorkspacesLoaded(false);
    setWorkspaceLoadFailed(false);
    setActiveWorkspaceUser(auth.user.id);
    const savedWorkspaceId = getActiveWorkspaceIdForUser(auth.user.id);
    let cancelled = false;
    void fetch(`${API_URL}/api/v1/workspaces`, { credentials: "include", cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<{ workspaces: WorkspaceOption[] }> : Promise.reject())
      .then(({ workspaces: items }) => {
        if (cancelled) return;
        setWorkspaces(items);
        setWorkspacesLoaded(true);
        const current = items.some((item) => item.id === savedWorkspaceId)
          ? savedWorkspaceId!
          : items.find((item) => item.role === "owner")?.id ?? items[0]?.id ?? "";
        setActiveWorkspaceId(current);
        if (current) setActiveWorkspaceSelection(auth.user.id, current);
      }).catch(() => {
        if (!cancelled) {
          setWorkspaces([]);
          setWorkspaceLoadFailed(true);
          setWorkspacesLoaded(true);
        }
      });
    return () => { cancelled = true; };
  }, [authReady, auth]);
  const selectWorkspace = useCallback((workspaceId: string) => {
    if (!auth || workspaceId === activeWorkspaceId) return;
    setActiveWorkspaceSelection(auth.user.id, workspaceId);
    setActiveWorkspaceId(workspaceId);
    window.location.reload();
  }, [activeWorkspaceId, auth]);
  useEffect(() => {
    if (!authReady || !auth || !canAccessInbox(auth.user.role)) return;
    let settingsLoaded = false;
    let notificationsEnabled = false;
    const seenMessageIds = new Set<string>();
    const socket = createChatSocket(API_URL, undefined, activeWorkspaceId || undefined);
    const handleIncomingMessage = (message: ChatMessageContract) => {
      if (message.senderType !== "customer" || !settingsLoaded || !notificationsEnabled || seenMessageIds.has(message.id)) return;
      seenMessageIds.add(message.id);
      if (seenMessageIds.size > 100) seenMessageIds.delete(seenMessageIds.values().next().value as string);
      const activeConversationId = (globalThis as typeof globalThis & { __nhuuChatConversationContext?: { id: string | null } }).__nhuuChatConversationContext?.id;
      if (location.pathname === "/inbox" && activeConversationId === message.conversationId) return;
      const senderName = message.senderName?.trim() || "Khách hàng";
      const preview = message.content?.trim() || "Đã gửi một tin nhắn mới";
      toast.custom((toastId) => <button type="button" onClick={() => { navigateToIncomingConversation(message); toast.dismiss(toastId); }} className="flex w-[min(380px,calc(100vw-2rem))] items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left text-slate-800 shadow-xl transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 cursor-pointer">
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-sky-50 text-sky-600"><svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.6 8.6 0 0 1-3.5-.8L3 21l1.9-5A8.2 8.2 0 0 1 3 11.5 8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5Z" /></svg></span>
        <span className="min-w-0 flex-1"><strong className="block truncate text-sm">{senderName}</strong><span className="mt-1 block truncate text-xs text-slate-600">{preview}</span></span>
      </button>, { id: `incoming-${message.id}`, duration: 5000 });
    };
    socket.on(chatEvents.incomingMessage, handleIncomingMessage);
    void loadGeneralSettings({ apiUrl: API_URL, token: "cookie-session", refresh }).then((settings) => {
      settingsLoaded = true;
      notificationsEnabled = settings.browserNotificationsEnabled;
    }).catch(() => undefined);
    return () => {
      socket.off(chatEvents.incomingMessage, handleIncomingMessage);
      socket.disconnect();
    };
  }, [auth, authReady, activeWorkspaceId, location.pathname, navigateToIncomingConversation, refresh]);
  const logout = useCallback(() => {
    persistInboxPlatform(undefined);
    void fetch(`${API_URL}/api/v1/auth/logout`, { method: "POST", credentials: "include" }).finally(() => {
      clearAuth();
      setAuth(null);
      navigate("landing");
    });
  }, [navigate]);
  const handleAuthenticated = useCallback((next: AuthResponse) => {
    setAuth({ user: next.user });
    navigate("dashboard");
  }, [navigate]);
  const renderAuthPage = useCallback((route: AuthRoute): React.ReactNode => {
    if (!authReady) return <PageSkeleton />;
    if (auth && route !== "reset-password") return <Navigate replace to="/dashboard" />;
    return <AuthRoutePage route={route} onNavigateAuth={navigateAuth} onResetSuccess={completePasswordReset} onAuthenticated={handleAuthenticated} />;
  }, [auth, authReady, completePasswordReset, handleAuthenticated, navigateAuth]);
  const authPages: Record<AuthRoute, React.ReactNode> = {
    login: renderAuthPage("login"),
    register: renderAuthPage("register"),
    "forgot-password": renderAuthPage("forgot-password"),
    "reset-password": renderAuthPage("reset-password")
  };
  const sessionFallback = sessionUnavailable
    ? <main className="grid min-h-screen place-items-center bg-slate-100 p-6" role="alert"><section className="w-full max-w-lg rounded-2xl bg-white p-8 text-center shadow-sm"><h1 className="text-xl font-semibold text-slate-900">Không nhận được phản hồi từ API</h1><p className="mt-3 text-slate-600">Máy chủ chưa phản hồi trong thời gian cho phép. Anh có thể thử kết nối lại.</p><button className="mt-6 cursor-pointer rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-white hover:bg-blue-700" onClick={() => { setSessionUnavailable(false); setAuthReady(false); setSessionRetryCount((count) => count + 1); }}>Thử lại</button></section></main>
    : <PageSkeleton />;
  let privatePage: React.ReactNode = null;
  if (auth && !canAccessInbox(auth.user.role)) {
    privatePage = <main><h1>Nhuu Chat</h1><p>Tài khoản của anh đã đăng nhập nhưng chưa có quyền mở inbox. Hãy nhờ admin cấp role agent.</p><button className="cursor-pointer transition-opacity hover:opacity-80" onClick={() => { void fetch(`${API_URL}/api/v1/auth/logout`, { method: "POST", credentials: "include" }).finally(() => { clearAuth(); setAuth(null); }); }}>Đăng xuất</button></main>;
  } else if (auth) {
    const inboxChannelId = inboxPlatform?.startsWith("facebook:")
      ? inboxPlatform.slice("facebook:".length)
      : undefined;
    const inboxConversationPlatform = inboxChannelId ? "facebook" : inboxPlatform;
    const openProfile = () => navigate("profile");
    const navigateFromHeader = (item: HeaderNavItem) => {
      if (item === "Hộp thư") return navigate("inbox", inboxPlatform);
      if (item === "Cài đặt") return navigate("settings");
      if (item === "Bài viết") return navigate("posts");
      return navigate("development", undefined, item);
    };
    const navigateFromMobileSettings = (item: string) => {
      const nextPath = settingsPathForItem(item as never);
      routerNavigate(nextPath);
    };
    const navigateFromMobileAbout = (section: string) => {
      const nextPath = aboutPathForSection(section as never);
      routerNavigate(nextPath);
    };
    const topbarProps = { user: auth.user, onLogout: logout, onProfile: openProfile };
    privatePage = page === "dashboard" ? <DashboardPage {...topbarProps} token="" refresh={refresh} onOpenInbox={(platform) => navigate("inbox", platform)} onLogoClick={() => navigate("dashboard")} onNavigate={navigateFromHeader} settingsSubmenuItems={mobileSettingsItems} nestedSettingsSubmenuItems={{ "Giới thiệu": mobileAboutSections }} onSettingsSubmenuNavigate={navigateFromMobileSettings} onNestedSettingsSubmenuNavigate={navigateFromMobileAbout} /> : page === "telegram" ? <TelegramPersonalPage token="" refresh={refresh} onBack={() => navigate("dashboard")} /> : page === "settings" ? <SettingsPage {...topbarProps} token="" refresh={refresh} onLogoClick={() => navigate("dashboard")} onNavigate={navigateFromHeader} /> : page === "profile" ? <ProfilePage {...topbarProps} token="" onLogoClick={() => navigate("dashboard")} onNavigate={navigateFromHeader} /> : page === "posts" ? <FacebookPublishingPage {...topbarProps} onBack={() => navigate("dashboard")} onLogoClick={() => navigate("dashboard")} onNavigate={navigateFromHeader} /> : page === "development" ? <DevelopmentPage {...topbarProps} section={developmentSection} onLogoClick={() => navigate("dashboard")} onNavigate={navigateFromHeader} /> : <InboxPage {...topbarProps} token="" platform={inboxConversationPlatform} channelId={inboxChannelId} selectedConversationId={requestedConversation?.id} selectedConversationRequest={requestedConversation?.request} refresh={refresh} onBack={() => navigate("dashboard")} onLogoClick={() => navigate("dashboard")} onNavigate={navigateFromHeader} />;
  }
  return <>
    <WorkspacePickerProvider value={authReady && auth ? {
      workspaces,
      activeWorkspaceId,
      loading: !workspacesLoaded,
      error: workspaceLoadFailed,
      onSelectWorkspace: selectWorkspace
    } satisfies WorkspacePickerState : null}>
    <Suspense fallback={<PageSkeleton />}>
      <ApplicationRoutes
        isAuthenticated={Boolean(auth)}
        isLoading={!authReady || sessionUnavailable}
        fallback={sessionFallback}
        landing={<LandingPage user={auth?.user ?? null} onDashboard={() => navigate("dashboard")} onLogin={() => navigateAuth("login")} onRegister={() => navigateAuth("register")} onLogout={logout} />}
        authPages={authPages}
        privatePage={privatePage}
      />
    </Suspense>
    </WorkspacePickerProvider>
    <Toaster
      position="top-right"
      richColors
    />
    {shouldRenderIntro(showIntro, page, authReady) && <NetflixIntro ready={introReady} onComplete={() => setShowIntro(false)} />}
  </>;
}
