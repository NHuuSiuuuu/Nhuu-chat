import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { inboxPlatformFromLocation, preloadIntroDependencies } from "./App.js";
import * as AppModule from "./App.js";

type AppModuleWithRouteTitle = typeof AppModule & {
  getRouteTitle?: (route: string) => string;
};

const appModule = AppModule as AppModuleWithRouteTitle;

describe("App navigation", () => {
  it("restores a selected channel from each supported Workspace platform", () => {
    expect(inboxPlatformFromLocation("?platform=zalo&channelId=oa-1")).toBe("zalo:oa-1");
    expect(inboxPlatformFromLocation("?platform=telegram&channelId=bot-1")).toBe("telegram:bot-1");
    expect(inboxPlatformFromLocation("?platform=instagram&channelId=ig-1")).toBe("instagram:ig-1");
    expect(inboxPlatformFromLocation("?platform=zalo_personal")).toBe("zalo_personal");
  });

  it("keeps the public landing page at root and sends an authenticated user to dashboard only from the user action", () => {
    const source = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
    const routes = readFileSync(new URL("./app-routes.tsx", import.meta.url), "utf8");

    expect(source).toContain('type AppPage = "landing"');
    expect(source).toContain('if (pathname === "/") return "landing"');
    expect(source).toContain('page === "landing"');
    expect(source).toContain("<LandingPage");
    expect(source).toContain('onDashboard={() => navigate("dashboard")}');
    expect(routes).toContain('<Route path="/" element={landing} />');
    expect(routes).toContain('<Route path="/login" element={authPages.login} />');
    expect(routes).toContain('<Route path="/register" element={authPages.register} />');
  });

  it("routes shared header navigation to its destination", () => {
    const source = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

    expect(source).toContain("onLogoClick={() => navigate(\"dashboard\")}");
    expect(source).toContain('if (item === "Hộp thư") return navigate("inbox", inboxPlatform)');
    expect(source).not.toContain('if (item === "Hộp thư") return navigate("inbox")');
    expect(source).toContain('if (item === "Cài đặt") return navigate("settings")');
    expect(source).toContain('return navigate("development", undefined, item)');
    expect(source).toContain("const routerNavigate = useNavigate()");
    expect(source).toContain("const location = useLocation()");
    expect(source).not.toContain("window.history.pushState");
    expect(source).not.toContain("window.addEventListener(\"popstate\"");
    expect(source).toContain("/inbox");
    expect(source).toContain("/dashboard");
    expect(source).toContain('if (nextPage === "inbox") {');
    expect(source).toContain("setInboxPlatform(platform);");
    expect(source).not.toContain('setInboxPlatform(nextPage === "inbox" ? platform : undefined)');
  });

  it("makes a global incoming-message toast navigate to its conversation", () => {
    const source = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

    expect(source).toContain("navigateToIncomingConversation(message); toast.dismiss(toastId)");
    expect(source).toContain("setRequestedConversation({ id: message.conversationId, request: ++incomingNavigationRequestRef.current })");
    expect(source).toContain("selectedConversationId={requestedConversation?.id}");
  });

  it("plays the saved notification sound from the global incoming-message listener", () => {
    const source = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

    expect(source).toContain("playNotificationSound(notificationSettings.notificationSound)");
    expect(source).toContain("notificationSettings.notificationSound !== \"off\"");
    expect(source).toContain('document.addEventListener("pointerdown", unlockAudio');
    expect(source).toContain('document.addEventListener("keydown", unlockAudio');
    expect(source).toContain("window.addEventListener(GENERAL_SETTINGS_UPDATED_EVENT, handleSettingsUpdated)");
    expect(source.indexOf("playNotificationSound(notificationSettings.notificationSound)")).toBeLessThan(
      source.indexOf('if (location.pathname === "/inbox" && activeConversationId === message.conversationId) return')
    );
  });

  it("loads the active Workspace, exposes its picker in the shared header, and passes its id to realtime", () => {
    const source = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
    expect(source).toContain('fetch(`${API_URL}/api/v1/workspaces`');
    expect(source).toContain("WorkspacePickerProvider");
    expect(source).not.toContain("workspaces.length > 1");
    expect(source).toContain("createChatSocket(API_URL, undefined, activeWorkspaceId || undefined)");
    expect(source).not.toContain("window.location.reload()");
    expect(source).toContain("workspaceContentVersion");
  });

  it("suspends the app-wide socket while hidden and keys inbox recovery by user and Workspace", () => {
    const source = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
    expect(source).toContain("pauseSocketWhenHidden(socket, document)");
    expect(source).toContain("<InboxPage key={`inbox-${auth.user.id}-${activeWorkspaceId}`}");
    expect(source).toContain("workspaceId={activeWorkspaceId}");
  });

  it("routes the settings header item to /settings and renders it below the shared header", () => {
    const source = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

    expect(source).toContain('type AppPage = "landing" | "dashboard" | "telegram" | "inbox" | "settings" | "profile" | "development"');
    expect(source).toContain('if (pathname === "/settings" || pathname.startsWith("/settings/")) return "settings"');
    expect(source).toContain('if (page === "settings") return "/settings"');
    expect(source).toContain('if (pathname === "/orders" || pathname === "/posts" || pathname === "/analytics") return "development"');
    expect(source).toContain('page === "development" ? <DevelopmentPage');
    expect(source).toContain("<SettingsPage");
    expect(source).toContain('pathname.startsWith("/settings/")');
  });

  it("passes settings submenu items to the dashboard mobile sidebar", () => {
    const source = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

    expect(source).toContain("mobileSettingsItems");
    expect(source).toContain("settingsSubmenuItems={mobileSettingsItems}");
  });

  it("routes nested About sections from the dashboard mobile menu to their stable paths", () => {
    const source = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

    expect(source).toContain("aboutPathForSection");
    expect(source).toContain("const navigateFromMobileAbout = (section: string)");
    expect(source).toContain("onNestedSettingsSubmenuNavigate={navigateFromMobileAbout}");
  });

  it("keeps the initial document background aligned before JavaScript loads", () => {
    const source = readFileSync(new URL("../index.html", import.meta.url), "utf8");

    expect(source).toContain('<body style="margin:0;background:#f0f2f7;color:#273348">');
    expect(source).toContain('<div id="root" style="min-height:100vh;background:#f0f2f7">');
  });

  it("shows a retry state when the auth API does not answer instead of leaving the page skeleton indefinitely", () => {
    const source = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

    expect(source).toContain("AUTH_REQUEST_TIMEOUT_MS");
    expect(source).toContain("Không nhận được phản hồi từ API");
    expect(source).toContain("Thử lại");
  });

  it("coordinates the intro with preload readiness and a Suspense fallback", async () => {
    const source = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

    expect(source).toContain("showIntro");
    expect(source).toContain("useState(true)");
    expect(source).toContain("introReady");
    expect(source).toContain("const introReady = introDependenciesReady && authReady");
    expect(source).toContain("shouldRenderIntro(showIntro, page, authReady)");
    expect(source).not.toContain("&& !sessionUnavailable && <NetflixIntro");
    expect(source).toContain("<NetflixIntro");
    expect(source).toContain("ready={introReady}");
    expect(source).toContain("Promise.all");
    expect(source).toContain("<Suspense");
    expect(source).toContain("PageSkeleton");
    expect(source).toContain("sessionStorage");
    expect(source).toContain("nhuu-chat.inbox-platform");
    expect(source).toContain("sessionStorage.setItem");
    expect(source).toContain("sessionStorage.removeItem");
    expect(source).not.toContain("/api/config");
    await expect(preloadIntroDependencies()).resolves.toBeUndefined();
  });

  it("exports a pure route-title helper for the main browser routes", () => {
    const getRouteTitle = appModule.getRouteTitle;
    const source = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
    expect(getRouteTitle).toBeTypeOf("function");
    if (typeof getRouteTitle !== "function") return;

    expect([
      getRouteTitle("dashboard"),
      getRouteTitle("inbox"),
      getRouteTitle("settings"),
      getRouteTitle("posts"),
      getRouteTitle("profile"),
      getRouteTitle("development")
    ]).toEqual([
      "Bảng điều khiển - NhuuChat",
      "Hộp thư - NhuuChat",
      "Cài đặt - NhuuChat",
      "Bài viết - NhuuChat",
      "Hồ sơ - NhuuChat",
      "Đang phát triển - NhuuChat"
    ]);
    expect(source).toContain("document.title = getRouteTitle(page)");
  });

  it("declares the application logo as the browser favicon", () => {
    const source = readFileSync(new URL("../index.html", import.meta.url), "utf8");

    expect(source).toContain('<link rel="icon" type="image/jpeg" href="/nhuu-favicon.jpg"');
  });

  it("configures the global Sonner toaster for NhuuChat", () => {
    const source = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

    expect(source).toContain('import { toast, Toaster } from "sonner";');
    expect(source).toContain('position="top-right"');
    expect(source).toContain("richColors");
    expect(source).not.toContain("toastOptions={{");
  });
});
