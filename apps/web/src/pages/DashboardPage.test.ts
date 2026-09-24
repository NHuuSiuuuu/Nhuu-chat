import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { FacebookPublishingApiError } from "../lib/facebook-publishing.api.js";
import * as DashboardPageModule from "./DashboardPage.js";
import { buildDashboardAccounts, buildWorkspaceDashboardAccounts, conversationPathForPlatform, createLatestRequestRunner, loadFacebookDashboardStatus } from "./DashboardPage.js";
import { buildConversationListRequestPath } from "./InboxPage.js";

describe("dashboard connected accounts", () => {
  it("builds staff dashboard accounts from every permitted Workspace platform", () => {
    expect(buildWorkspaceDashboardAccounts([
      { platform: "facebook", channelId: "page-42", name: "Facebook Page" },
      { platform: "zalo_personal", channelId: "owner-1", name: "Zalo cá nhân", displayId: "zalo-user-1" },
      { platform: "telegram_personal", channelId: "owner-1", name: "Telegram cá nhân", displayId: "telegram-user-1" },
      { platform: "zalo", channelId: "oa-1", name: "Zalo OA" },
      { platform: "telegram", channelId: "bot-1", name: "Telegram Bot" },
      { platform: "instagram", channelId: "ig-1", name: "Instagram" }
    ])).toMatchObject([
      { id: "facebook:page-42", platform: "facebook", identifier: "page-42" },
      { id: "zalo_personal", platform: "zalo", identifier: "zalo-user-1" },
      { id: "telegram_personal", platform: "telegram", identifier: "telegram-user-1" },
      { id: "zalo:oa-1", platform: "zalo", identifier: "oa-1" },
      { id: "telegram:bot-1", platform: "telegram", identifier: "bot-1" },
      { id: "instagram:ig-1", platform: "instagram", identifier: "ig-1" }
    ]);
  });

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
      { id: "connection-1", pageId: "page-42", pageName: "Nhuu Page", avatarUrl: "https://cdn.example/facebook.jpg", status: "connected" }
    )).toContainEqual({
      id: "facebook:page-42",
      platform: "facebook",
      pageId: "page-42",
      name: "Nhuu Page",
      identifier: "page-42",
      avatarUrl: "https://cdn.example/facebook.jpg"
    });
  });

  it("builds a separate account card and Inbox filter target for every connected Instagram account", () => {
    expect(buildDashboardAccounts(
      { connected: false, displayName: null, username: null },
      { id: "zalo-session-1", status: "disconnected" },
      null,
      [
        { id: "connection-1", instagramUserId: "ig-1", username: "shop_one", displayName: "Shop One", avatarUrl: "https://cdn.example/one.jpg", status: "connected", tokenExpiresAt: null, subscribedAt: null, lastValidatedAt: null, lastErrorCode: null, createdAt: "2026-09-24T00:00:00.000Z", updatedAt: "2026-09-24T00:00:00.000Z" },
        { id: "connection-2", instagramUserId: "ig-2", username: "shop_two", displayName: null, avatarUrl: null, status: "connected", tokenExpiresAt: null, subscribedAt: null, lastValidatedAt: null, lastErrorCode: null, createdAt: "2026-09-24T00:00:00.000Z", updatedAt: "2026-09-24T00:00:00.000Z" }
      ]
    )).toMatchObject([
      { id: "instagram:ig-1", platform: "instagram", identifier: "ig-1", username: "shop_one", name: "Shop One", avatarUrl: "https://cdn.example/one.jpg" },
      { id: "instagram:ig-2", platform: "instagram", identifier: "ig-2", username: "shop_two", name: "shop_two" }
    ]);
  });

  it("keeps invalid Instagram connections visible and identifies the exact connection to disconnect", () => {
    const accounts = buildDashboardAccounts(
      { connected: false, displayName: null, username: null },
      { id: "zalo-session-1", status: "disconnected" },
      null,
      [{ id: "db-connection-id", instagramUserId: "ig-3", username: "shop_three", displayName: null, avatarUrl: null, status: "invalid", tokenExpiresAt: null, subscribedAt: null, lastValidatedAt: null, lastErrorCode: "INSTAGRAM_TOKEN_INVALID", createdAt: "2026-09-24T00:00:00.000Z", updatedAt: "2026-09-24T00:00:00.000Z" }]
    );
    expect(accounts).toMatchObject([{ id: "instagram:ig-3", status: "error" }]);
    expect((DashboardPageModule as unknown as { instagramConnectionIdForAccount: (account: typeof accounts[number]) => string | null }).instagramConnectionIdForAccount(accounts[0])).toBe("db-connection-id");
  });

  it("preserves an Instagram load failure as an error instead of treating the account list as empty", async () => {
    const load = (DashboardPageModule as unknown as { loadInstagramDashboardConnections: (request: () => Promise<never>) => Promise<{ connections: unknown[] | null; error: string | null }> }).loadInstagramDashboardConnections;
    expect(load).toBeTypeOf("function");
    if (typeof load === "function") {
      await expect(load(async () => { throw new Error("network detail"); })).resolves.toEqual({
        connections: null,
        error: "Không thể kiểm tra kết nối Instagram. Vui lòng thử lại."
      });
    }
  });

  it("ignores an older Instagram response after switching between owner Workspaces", async () => {
    let activeWorkspaceId: string | undefined = "owner-workspace-a";
    let resolveOlder: ((accounts: string[]) => void) | undefined;
    const visibleAccounts: string[][] = [];
    const runner = (DashboardPageModule as unknown as {
      createWorkspaceScopedRequestRunner: (
        getWorkspaceId: () => string | undefined,
        onResult: (result: string[]) => void
      ) => (workspaceId: string | undefined, request: () => Promise<string[]>) => Promise<string[]>;
    }).createWorkspaceScopedRequestRunner;
    expect(runner).toBeTypeOf("function");
    if (typeof runner !== "function") return;
    const run = runner(() => activeWorkspaceId, (result) => visibleAccounts.push(result));

    const olderWorkspaceRequest = run("owner-workspace-a", () => new Promise<string[]>((resolve) => { resolveOlder = resolve; }));
    activeWorkspaceId = "owner-workspace-b";
    const currentWorkspaceRequest = run("owner-workspace-b", async () => ["account-b"]);
    await currentWorkspaceRequest;
    resolveOlder?.(["account-a"]);
    await olderWorkspaceRequest;

    expect(visibleAccounts).toEqual([["account-b"]]);
  });

  it("does not render the previous Workspace Instagram accounts while the new Workspace is loading", () => {
    const workspaceScopedValue = (DashboardPageModule as unknown as {
      workspaceScopedValue: <T>(activeWorkspaceId: string | undefined, storedWorkspaceId: string | undefined, value: T) => T | null;
    }).workspaceScopedValue;
    expect(workspaceScopedValue).toBeTypeOf("function");
    if (typeof workspaceScopedValue !== "function") return;
    const priorWorkspaceAccounts = [{ id: "prior-connection", instagramUserId: "ig-from-a", username: "workspace_a", displayName: "Workspace A", avatarUrl: null, status: "connected" as const, tokenExpiresAt: null, subscribedAt: null, lastValidatedAt: null, lastErrorCode: null, createdAt: "2026-09-24T00:00:00.000Z", updatedAt: "2026-09-24T00:00:00.000Z" }];
    const visibleConnections = workspaceScopedValue("owner-workspace-b", "owner-workspace-a", priorWorkspaceAccounts) ?? [];
    const accounts = buildDashboardAccounts({ connected: false, displayName: null, username: null }, { id: "zalo", status: "disconnected" }, null, visibleConnections);

    expect(accounts.some((account) => account.identifier === "ig-from-a")).toBe(false);
  });

  it("maps each connected channel to its platform identifier instead of its username", () => {
    expect(buildDashboardAccounts(
      { connected: true, telegramUserId: "telegram-42", displayName: "Telegram cá nhân", username: "wrong-username" },
      { id: "zalo-session-1", zaloUserId: "zalo-84", status: "connected", displayName: "Zalo cá nhân", username: "wrong-username" },
      { id: "connection-1", pageId: "facebook-21", pageName: "Nhuu Page", status: "connected" }
    )).toMatchObject([
      { platform: "telegram", identifier: "telegram-42" },
      { platform: "zalo", identifier: "zalo-84" },
      { platform: "facebook", identifier: "facebook-21" }
    ]);
  });

  it("opens the selected platform or all platforms only for merge view", () => {
    expect(conversationPathForPlatform("zalo_personal")).toBe("/inbox");
    expect(conversationPathForPlatform("telegram_personal")).toBe("/inbox");
    expect(conversationPathForPlatform("facebook:page-42")).toBe(
      "/inbox?platform=facebook&channelId=page-42"
    );
    expect(conversationPathForPlatform("instagram:ig-42")).toBe("/inbox?platform=instagram&channelId=ig-42");
    expect(conversationPathForPlatform("zalo:oa-1")).toBe("/inbox?platform=zalo&channelId=oa-1");
    expect(conversationPathForPlatform("telegram:bot-1")).toBe("/inbox?platform=telegram&channelId=bot-1");
    expect(conversationPathForPlatform()).toBe("/inbox");
  });

  it("requests Facebook conversations with the selected Page ID", () => {
    expect(buildConversationListRequestPath("facebook", "page-42")).toBe(
      "/api/v1/conversations?platform=facebook&channelId=page-42"
    );
  });

  it("requests conversations for the selected Instagram account ID", () => {
    expect(buildConversationListRequestPath("instagram", "ig-42")).toBe(
      "/api/v1/conversations?platform=instagram&channelId=ig-42"
    );
  });

  it("fetches Facebook connection data and exposes a Facebook filter", () => {
    const source = readFileSync(new URL("./DashboardPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("getFacebookPageConnection");
    expect(source).toContain("availablePlatforms.map((provider)");
    expect(source).toContain('facebook: "Facebook"');
    expect(source).toContain("buildDashboardAccounts(");
  });

  it("loads staff cards from the active Workspace channel API instead of personal status endpoints", () => {
    const source = readFileSync(new URL("./DashboardPage.tsx", import.meta.url), "utf8");
    expect(source).toContain('activeWorkspace?.role === "staff"');
    expect(source).toContain("/api/v1/workspaces/${activeWorkspace.id}/channels");
    expect(source).toContain("buildWorkspaceDashboardAccounts(workspaceChannels ?? [])");
    expect(source).toContain("canManage={!isWorkspaceStaff && (account.platform !== \"instagram\" || isWorkspaceOwner)}");
    expect(source).toContain("isWorkspaceStaff ? Promise.resolve({ connections: [], error: null }) : loadInstagramDashboardConnections()");
  });

  it("limits Instagram connection management to the active Workspace owner", () => {
    const source = readFileSync(new URL("./DashboardPage.tsx", import.meta.url), "utf8");
    expect(source).toContain('const isWorkspaceOwner = activeWorkspace?.role === "owner"');
    expect(source).toContain('account.platform !== "instagram" || isWorkspaceOwner');
    expect(source).toContain("canManageInstagram={isWorkspaceOwner}");
    expect(source).toContain("buildWorkspaceDashboardAccounts(workspaceChannels ?? [])");
  });

  it("forwards nested settings navigation from the dashboard topbar", () => {
    const source = readFileSync(new URL("./DashboardPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("onNestedSettingsSubmenuNavigate?: (item: string) => void");
    expect(source).toContain("onNestedSettingsSubmenuNavigate={onNestedSettingsSubmenuNavigate}");
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

  it("applies only the newest Facebook status request result while each caller can await completion", async () => {
    let resolveOlder: ((value: string) => void) | undefined;
    const appliedResults: string[] = [];
    const runLatest = createLatestRequestRunner<string>((result) => appliedResults.push(result));

    const olderRequest = runLatest(() => new Promise<string>((resolve) => { resolveOlder = resolve; }));
    const newerRequest = runLatest(async () => "newer");

    await newerRequest;
    expect(appliedResults).toEqual(["newer"]);

    resolveOlder?.("older");
    await olderRequest;
    expect(appliedResults).toEqual(["newer"]);
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

  it("offers refresh and disconnect actions from the account menu", () => {
    const source = readFileSync(new URL("./DashboardPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("Làm mới kết nối");
    expect(source).toContain("Ngắt kết nối");
    expect(source).toContain("onRefresh");
    expect(source).toContain("initialProvider");
  });

  it("includes Facebook in the merge-pages modal", () => {
    const source = readFileSync(new URL("./DashboardPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("<MergePagesModal pages={accounts}");
    expect(source).toContain('account.platform === "facebook"');
  });

  it("offers refresh and disconnect actions for a Facebook Page card", () => {
    const source = readFileSync(new URL("./DashboardPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("removeFacebookPage");
    expect(source).toContain('method: "DELETE"');
    expect(source).toContain('account.platform === "facebook"');
    expect(source).toContain("Làm mới kết nối");
    expect(source).toContain("Ngắt kết nối");
  });

  it("disconnects Instagram with its server connection ID then reloads dashboard state", () => {
    const source = readFileSync(new URL("./DashboardPage.tsx", import.meta.url), "utf8");
    expect(source).toContain("await removeInstagramConnection(connectionId)");
    expect(source).toContain("await loadStatus(accountToDeactivate.platform === \"facebook\")");
    expect(source).toContain('account.platform === "instagram"');
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

  it("renders safe avatar loading and preserves initials when the image fails", () => {
    const source = readFileSync(new URL("./DashboardPage.tsx", import.meta.url), "utf8");

    expect(source).toContain('referrerPolicy="no-referrer"');
    expect(source).toContain("onError={() => setAvatarFailed(true)}");
    expect(source).toContain("avatarUrl && !avatarFailed");
    expect(source).toContain("account.name.slice(0, 1).toUpperCase()");
  });

  it("uses the normalized identifier as the card secondary text", () => {
    const source = readFileSync(new URL("./DashboardPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("account.identifier");
    expect(source).not.toContain('account.platform === "facebook" ? `${platformLabelForPage(account)} Page`');
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

  it("shows a spinning refresh icon while reloading dashboard data", () => {
    const source = readFileSync(new URL("./DashboardPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("isReloading");
    expect(source).toContain("setIsReloading(true)");
    expect(source).toContain("finally");
    expect(source).toContain('<InboxIcon name="refresh" size={18} className={isReloading ? "animate-spin" : ""} />');
    expect(source).toContain("isReloading ? \"animate-spin\" : \"\"");
    expect(source).not.toContain(">↻</button>");
  });
});
