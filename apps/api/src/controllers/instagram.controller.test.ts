import { beforeEach, describe, expect, it, vi } from "vitest";

const oauth = vi.hoisted(() => ({ start: vi.fn(), finish: vi.fn(), cancel: vi.fn() }));
const accounts = vi.hoisted(() => ({ list: vi.fn(), disconnect: vi.fn() }));
vi.mock("../services/instagram-oauth.service.js", () => ({ instagramOAuthService: oauth }));
vi.mock("../services/instagram-account.service.js", () => ({ instagramAccountService: accounts }));

import { finishInstagramOAuth, listInstagramConnections, removeInstagramConnection, startInstagramOAuth } from "./instagram.controller.js";

function recorder() {
  const response = { json: vi.fn(), redirect: vi.fn(), status: vi.fn().mockReturnThis() };
  return response;
}

describe("Instagram controller", () => {
  beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("WEB_APP_URL", "https://app.example.com"); });

  it("requires owner for start and disconnect", async () => {
    const response = recorder(); const next = vi.fn();
    await startInstagramOAuth({ auth: { id: "staff" }, workspace: { role: "staff", ownerUserId: "owner" } } as never, response as never, next);
    expect(next.mock.calls[0][0]).toMatchObject({ code: "WORKSPACE_OWNER_REQUIRED" });
    await removeInstagramConnection({ auth: { id: "staff" }, workspace: { role: "staff", ownerUserId: "owner" }, params: { connectionId: "1" } } as never, response as never, next);
    expect(accounts.disconnect).not.toHaveBeenCalled();
  });

  it("returns safe owner connections and filters staff by channel grant", async () => {
    accounts.list.mockResolvedValue([{ id: "1", instagramUserId: "123", status: "connected" }, { id: "2", instagramUserId: "456", status: "connected" }]);
    const response = recorder();
    await listInstagramConnections({ auth: { id: "staff" }, workspace: { role: "staff", ownerUserId: "owner", allowedChannels: [{ platform: "instagram", channelId: "456" }] } } as never, response as never, vi.fn());
    expect(accounts.list).toHaveBeenCalledWith("owner");
    expect(response.json).toHaveBeenCalledWith({ connections: [{ id: "2", instagramUserId: "456", status: "connected" }] });
  });

  it("returns only currently connected Instagram accounts for owners", async () => {
    accounts.list.mockResolvedValue([
      { id: "active", instagramUserId: "123", status: "connected" },
      { id: "pending-removal", instagramUserId: "456", status: "remove_pending" }
    ]);
    const response = recorder();
    await listInstagramConnections({ auth: { id: "owner" }, workspace: { role: "owner", ownerUserId: "owner", allowedChannels: [] } } as never, response as never, vi.fn());
    expect(response.json).toHaveBeenCalledWith({ connections: [{ id: "active", instagramUserId: "123", status: "connected" }] });
  });

  it("does not list a staff Instagram connection while its exact channel is revoked", async () => {
    accounts.list.mockResolvedValue([{ id: "1", instagramUserId: "123", status: "connected" }]);
    const response = recorder();
    await listInstagramConnections({ auth: { id: "staff" }, workspace: {
      role: "staff", ownerUserId: "owner", allowedChannels: [{ platform: "instagram", channelId: "123" }],
      revokedChannels: [{ platform: "instagram", channelId: "123" }]
    } } as never, response as never, vi.fn());
    expect(response.json).toHaveBeenCalledWith({ connections: [] });
  });

  it("keeps an empty staff allowlist unrestricted except for an exact revoked account", async () => {
    accounts.list.mockResolvedValue([{ id: "1", instagramUserId: "123", status: "connected" }, { id: "2", instagramUserId: "456", status: "connected" }]);
    const response = recorder();
    await listInstagramConnections({ auth: { id: "staff" }, workspace: {
      role: "staff", ownerUserId: "owner", allowedChannels: [],
      revokedChannels: [{ platform: "instagram", channelId: "123" }]
    } } as never, response as never, vi.fn());
    expect(response.json).toHaveBeenCalledWith({ connections: [] });
  });

  it("redirects successful and cancelled callbacks through a fixed frontend path", async () => {
    oauth.finish.mockResolvedValue({ id: "1", instagramUserId: "instagram-account-123" });
    const success = recorder();
    await finishInstagramOAuth({ auth: { id: "owner" }, workspace: { role: "owner", ownerUserId: "owner" }, query: { code: "secret-code", state: "state-1", next: "https://evil.example" } } as never, success as never, vi.fn());
    expect(oauth.finish).toHaveBeenCalledWith("owner", "state-1", "secret-code");
    expect(success.redirect).toHaveBeenCalledWith(302, "https://app.example.com/dashboard?instagram_oauth=success&instagram_user_id=instagram-account-123");
    expect(success.redirect.mock.calls[0]?.[1]).not.toContain("secret-code");
    const cancelled = recorder();
    await finishInstagramOAuth({ auth: { id: "owner" }, workspace: { role: "owner", ownerUserId: "owner" }, query: { error: "access_denied", state: "state-2" } } as never, cancelled as never, vi.fn());
    expect(oauth.cancel).toHaveBeenCalledWith("owner", "state-2");
    expect(cancelled.redirect).toHaveBeenCalledWith(302, "https://app.example.com/dashboard?instagram_oauth=cancelled");
  });

  it("does not send an Instagram account ID on failed OAuth callbacks", async () => {
    oauth.finish.mockRejectedValue(Object.assign(new Error("OAuth failed"), { code: "INSTAGRAM_OAUTH_FAILED" }));
    const response = recorder();
    await finishInstagramOAuth({ auth: { id: "owner" }, workspace: { role: "owner", ownerUserId: "owner" }, query: { code: "secret-code", state: "state-1" } } as never, response as never, vi.fn());
    expect(response.redirect.mock.calls[0]?.[1]).toContain("instagram_oauth=error");
    expect(response.redirect.mock.calls[0]?.[1]).not.toContain("instagram_user_id");
    expect(response.redirect.mock.calls[0]?.[1]).not.toContain("secret-code");
  });
});
