import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { FacebookPublishingApiError } from "../lib/facebook-publishing.api.js";
import { buildDashboardAccounts, conversationPathForPlatform, loadFacebookDashboardStatus } from "./DashboardPage.js";
import { buildConversationListRequestPath } from "./InboxPage.js";

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

  it("includes the connected Facebook Page with its Page ID context", () => {
    expect(buildDashboardAccounts(
      { connected: false, displayName: null, username: null },
      { id: "zalo-session-1", status: "disconnected" },
      { id: "connection-1", pageId: "page-42", pageName: "Nhuu Page", status: "connected" }
    )).toContainEqual({
      id: "facebook:page-42",
      platform: "facebook",
      pageId: "page-42",
      name: "Nhuu Page"
    });
  });

  it("opens the selected platform or all platforms only for merge view", () => {
    expect(conversationPathForPlatform("zalo_personal")).toBe("/inbox");
    expect(conversationPathForPlatform("telegram_personal")).toBe("/inbox");
    expect(conversationPathForPlatform("facebook:page-42")).toBe(
      "/inbox?platform=facebook&channelId=page-42"
    );
    expect(conversationPathForPlatform()).toBe("/inbox");
  });

  it("requests Facebook conversations with the selected Page ID", () => {
    expect(buildConversationListRequestPath("facebook", "page-42")).toBe(
      "/api/v1/conversations?platform=facebook&channelId=page-42"
    );
  });

  it("fetches Facebook connection data and exposes a Facebook filter", () => {
    const source = readFileSync(new URL("./DashboardPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("getFacebookPageConnection");
    expect(source).toContain('provider="facebook"');
    expect(source).toContain('filter === "facebook"');
    expect(source).toContain("facebook:pageId");
  });

  it("treats only a missing Facebook connection as disconnected", async () => {
    const result = await loadFacebookDashboardStatus(
      async () => { throw new FacebookPublishingApiError("FACEBOOK_PAGE_NOT_CONNECTED", "missing", 404); },
      100
    );

    expect(result).toEqual({ connection: null, error: null });
  });

  it("keeps a Facebook service failure visible instead of treating it as disconnected", async () => {
    const result = await loadFacebookDashboardStatus(
      async () => { throw new FacebookPublishingApiError("FACEBOOK_PUBLISHING_REQUEST_FAILED", "failed", 503); },
      100
    );

    expect(result).toEqual({
      connection: null,
      error: "Không thể kiểm tra kết nối Facebook. Vui lòng thử lại."
    });
  });

  it("aborts a hanging Facebook connection request at the configured deadline", async () => {
    vi.useFakeTimers();
    try {
      let requestSignal: AbortSignal | undefined;
      const resultPromise = loadFacebookDashboardStatus((signal) => {
        requestSignal = signal;
        return new Promise((_, reject) => {
          signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
        });
      }, 100);

      await vi.advanceTimersByTimeAsync(100);

      expect(requestSignal?.aborted).toBe(true);
      await expect(resultPromise).resolves.toEqual({
        connection: null,
        error: "Không thể kiểm tra kết nối Facebook. Vui lòng thử lại."
      });
    } finally {
      vi.useRealTimers();
    }
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

  it("uses an SVG layers icon for the merge action and balances mobile spacing", () => {
    const source = readFileSync(new URL("./DashboardPage.tsx", import.meta.url), "utf8");

    expect(source).toContain('<InboxIcon name="layers" size={17} />');
    expect(source).toContain("max-[700px]:mt-[34px]");
    expect(source).not.toContain('<span className="text-lg">♣</span> Gộp trang');
  });

  it("opens the page selection modal from the merge action", () => {
    const source = readFileSync(new URL("./DashboardPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("MergePagesModal");
    expect(source).toContain("showMergePages");
    expect(source).toContain("setShowMergePages(true)");
    expect(source).toContain('onClick={openMergeModal}');
  });
});
