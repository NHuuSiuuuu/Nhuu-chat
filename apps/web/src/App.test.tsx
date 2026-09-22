import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { preloadIntroDependencies } from "./App.js";
import * as AppModule from "./App.js";

type AppModuleWithRouteTitle = typeof AppModule & {
  getRouteTitle?: (route: string) => string;
};

const appModule = AppModule as AppModuleWithRouteTitle;

describe("App navigation", () => {
  it("routes shared header navigation to its destination", () => {
    const source = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

    expect(source).toContain("onLogoClick={() => navigate(\"dashboard\")}");
    expect(source).toContain('if (item === "Hộp thư") return navigate("inbox", inboxPlatform)');
    expect(source).not.toContain('if (item === "Hộp thư") return navigate("inbox")');
    expect(source).toContain('if (item === "Cài đặt") return navigate("settings")');
    expect(source).toContain('return navigate("development", undefined, item)');
    expect(source).toContain("window.history.pushState");
    expect(source).toContain("window.addEventListener(\"popstate\"");
    expect(source).toContain("/inbox");
    expect(source).toContain("/dashboard");
    expect(source).toContain('if (nextPage === "inbox") {');
    expect(source).toContain("setInboxPlatform(platform);");
    expect(source).not.toContain('setInboxPlatform(nextPage === "inbox" ? platform : undefined)');
  });

  it("routes the settings header item to /settings and renders it below the shared header", () => {
    const source = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

    expect(source).toContain('type AppPage = "dashboard" | "telegram" | "inbox" | "settings" | "profile" | "development"');
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

  it("keeps the initial document background aligned before JavaScript loads", () => {
    const source = readFileSync(new URL("../index.html", import.meta.url), "utf8");

    expect(source).toContain('<body style="margin:0;background:#f0f2f7;color:#273348">');
    expect(source).toContain('<div id="root" style="min-height:100vh;background:#f0f2f7">');
  });

  it("coordinates the intro with preload readiness and a Suspense fallback", async () => {
    const source = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

    expect(source).toContain("showIntro");
    expect(source).toContain("useState(true)");
    expect(source).toContain("introReady");
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

    expect(source).toContain('import { Toaster } from "sonner";');
    expect(source).toContain('position="top-right"');
    expect(source).toContain('borderRadius: "12px"');
    expect(source).toContain('fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"');
    expect(source).toContain('background: "#ffffff"');
    expect(source).toContain('color: "#273348"');
  });
});
