import { describe, expect, it } from "vitest";

import { buildDashboardAccounts, conversationPathForPlatform } from "./DashboardPage.js";

describe("dashboard connected accounts", () => {
  it("includes a connected Zalo personal account beside Telegram", () => {
    expect(buildDashboardAccounts(
      { connected: true, displayName: "Telegram cá nhân", username: "telegram-user" },
      { id: "zalo-session-1", status: "connected", displayName: "Zalo cá nhân", username: "zalo-user" }
    )).toEqual([
      { id: "telegram_personal", platform: "telegram", name: "Telegram cá nhân", username: "telegram-user" },
      { id: "zalo_personal", platform: "zalo", name: "Zalo cá nhân", username: "zalo-user" }
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
    expect(conversationPathForPlatform("zalo_personal")).toBe("/inbox?platform=zalo_personal");
    expect(conversationPathForPlatform("telegram_personal")).toBe("/inbox?platform=telegram_personal");
    expect(conversationPathForPlatform()).toBe("/inbox");
  });
});
