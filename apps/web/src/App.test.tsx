import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { preloadIntroDependencies } from "./App.js";

describe("App navigation", () => {
  it("routes shared header navigation to its destination", () => {
    const source = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

    expect(source).toContain("onLogoClick={() => navigate(\"dashboard\")}");
    expect(source).toContain('if (item === "Hội thoại") return navigate("inbox", inboxPlatform)');
    expect(source).not.toContain('if (item === "Hội thoại") return navigate("inbox")');
    expect(source).toContain('if (item === "Cài đặt") return navigate("settings")');
    expect(source).toContain('return navigate("development", undefined, item)');
    expect(source).toContain("window.history.pushState");
    expect(source).toContain("window.addEventListener(\"popstate\"");
    expect(source).toContain("/inbox");
    expect(source).toContain("/dashboard");
    expect(source).toContain('if (nextPage === "inbox") setInboxPlatform(platform)');
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
    expect(source).not.toContain("sessionStorage");
    expect(source).not.toContain("/api/config");
    await expect(preloadIntroDependencies()).resolves.toBeUndefined();
  });
});
