import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("App navigation", () => {
  it("routes the shared logo to Dashboard and the header conversation link to Inbox", () => {
    const source = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

    expect(source).toContain("onLogoClick={() => navigate(\"dashboard\")}");
    expect(source).toContain('item === "Hội thoại" ? "inbox"');
    expect(source).toContain('item === "Cài đặt" ? "settings"');
    expect(source).toContain("window.history.pushState");
    expect(source).toContain("window.addEventListener(\"popstate\"");
    expect(source).toContain("/inbox");
    expect(source).toContain("/dashboard");
  });

  it("routes the settings header item to /settings and renders it below the shared header", () => {
    const source = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

    expect(source).toContain('type AppPage = "dashboard" | "telegram" | "inbox" | "settings"');
    expect(source).toContain('if (pathname === "/settings") return "settings"');
    expect(source).toContain('if (page === "settings") return "/settings"');
    expect(source).toContain('item === "Cài đặt" ? "settings"');
    expect(source).toContain("<SettingsPage");
  });
});
