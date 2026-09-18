import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { buildDashboardAccounts, conversationPathForPlatform } from "./DashboardPage.js";

describe("dashboard connected accounts", () => {
  it("includes a connected Zalo personal account beside Telegram", () => {
    expect(buildDashboardAccounts(
      { connected: true, displayName: "Telegram cá nhân", username: "telegram-user", avatarUrl: "https://cdn.example/telegram.jpg" },
      { id: "zalo-session-1", status: "connected", displayName: "Zalo cá nhân", username: "zalo-user", avatarUrl: "https://cdn.example/zalo.jpg" }
    )).toEqual([
      { id: "telegram_personal", platform: "telegram", name: "Telegram cá nhân", username: "telegram-user", avatarUrl: "https://cdn.example/telegram.jpg" },
      { id: "zalo_personal", platform: "zalo", name: "Zalo cá nhân", username: "zalo-user", avatarUrl: "https://cdn.example/zalo.jpg" }
    ]);
  });

  it("keeps a persisted Zalo account visible when its listener needs reconnecting", () => {
    expect(buildDashboardAccounts(
      { connected: false, displayName: null, username: null },
      { id: "zalo-session-1", status: "error", displayName: "Nguyễn Ngọc Hưng", username: "t_m7deefacm6" }
    )).toEqual([
      { id: "zalo_personal", platform: "zalo", name: "Nguyễn Ngọc Hưng", username: "t_m7deefacm6", status: "error" }
    ]);
  });

  it("opens the selected platform or all platforms only for merge view", () => {
    expect(conversationPathForPlatform("zalo_personal")).toBe("/inbox");
    expect(conversationPathForPlatform("telegram_personal")).toBe("/inbox");
    expect(conversationPathForPlatform()).toBe("/inbox");
  });

  it("offers a confirmation action to deactivate a connected account", () => {
    const source = readFileSync(new URL("./DashboardPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("aria-label=\"Tùy chọn tài khoản\"");
    expect(source).toContain("Hủy kích hoạt");
    expect(source).toContain("Xác nhận hủy kích hoạt");
    expect(source).toContain("/api/v1/channels/zalo-personal/logout");
    expect(source).toContain("/api/v1/channels/telegram-personal/logout");
    expect(source).toContain("account.id === \"zalo_personal\" || account.id === \"telegram_personal\"");
  });

  it("renders connected accounts as a compact responsive grid without the redundant section title", () => {
    const source = readFileSync(new URL("./DashboardPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3");
    expect(source).not.toContain(">Tài khoản đã kết nối</h2>");
    expect(source).toContain("rounded-lg");
    expect(source).toContain("<PlatformIcon provider={account.platform} />");
  });

  it("keeps the mobile dashboard content directly below the wrapped header and renders account avatars", () => {
    const source = readFileSync(new URL("./DashboardPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("max-[700px]:pt-0");
    expect(source).not.toContain("max-[700px]:pt-28");
    expect(source).toContain("avatarUrl?: string | null");
    expect(source).toContain("account.avatarUrl");
    expect(source).toContain("object-cover");
  });

  it("provides a compact mobile platform filter menu while keeping the desktop filter bar", () => {
    const source = readFileSync(new URL("./DashboardPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("isFilterMenuOpen");
    expect(source).toContain("Mở bộ lọc nền tảng");
    expect(source).toContain("Đóng bộ lọc nền tảng");
    expect(source).toContain("min-[701px]:hidden");
    expect(source).toContain("min-[701px]:flex");
  });

  it("uses SVG chevrons instead of Unicode arrow characters for the mobile filter", () => {
    const source = readFileSync(new URL("./DashboardPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("<InboxIcon name={isFilterMenuOpen ? \"chevron-up\" : \"chevron-down\"}");
    expect(source).not.toContain("⌃");
    expect(source).not.toContain("⌄");
  });
});
