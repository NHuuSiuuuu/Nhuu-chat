import { describe, expect, it, vi } from "vitest";

import { InstagramOAuthService } from "./instagram-oauth.service.js";

function setup() {
  const states = new Map<string, { userId: string }>();
  const store = {
    save: vi.fn(async (state: string, value: { userId: string }) => { states.set(state, value); }),
    consume: vi.fn(async (state: string) => { const value = states.get(state); states.delete(state); return value; })
  };
  const connect = vi.fn(async () => ({
    id: "connection-1", instagramUserId: "123", username: "business", displayName: "Business", avatarUrl: null,
    status: "connected" as const, tokenExpiresAt: null, subscribedAt: null, lastValidatedAt: null,
    lastErrorCode: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  }));
  const fetchMeta = vi.fn(async (input: string) => {
    const url = new URL(input);
    if (url.hostname === "api.instagram.com") return new Response(JSON.stringify({ access_token: "short-secret", user_id: 123 }), { status: 200 });
    if (url.pathname.endsWith("/access_token")) return new Response(JSON.stringify({ access_token: "long-secret", expires_in: 5184000 }), { status: 200 });
    return new Response(JSON.stringify({ id: "scoped-999", user_id: "123", username: "business", name: "Business" }), { status: 200 });
  });
  const service = new InstagramOAuthService({ appId: "app-id", appSecret: "app-secret", redirectUri: "https://api.example.com/callback", graphApiVersion: "v26.0", stateStore: store, fetchMeta, randomToken: () => "state-1", connect });
  return { service, store, fetchMeta, connect };
}

describe("Instagram OAuth", () => {
  it("starts Instagram Login with minimal scopes and a bound state", async () => {
    const { service, store } = setup();
    const url = new URL((await service.start("owner-1")).authorizationUrl);
    expect(url.origin).toBe("https://www.instagram.com");
    expect(url.searchParams.get("scope")).toBe("instagram_business_basic,instagram_business_manage_messages");
    expect(url.searchParams.get("state")).toBe("state-1");
    expect(store.save).toHaveBeenCalledWith("state-1", { userId: "owner-1" }, 600);
  });

  it("exchanges code, long token and profile before connecting", async () => {
    const { service, fetchMeta, connect } = setup();
    await service.start("owner-1");
    await service.finish("owner-1", "state-1", "code-1");
    expect(new URL(fetchMeta.mock.calls[0][0]).origin).toBe("https://api.instagram.com");
    expect(new URL(fetchMeta.mock.calls[1][0]).origin).toBe("https://graph.instagram.com");
    expect(connect).toHaveBeenCalledWith("owner-1", expect.objectContaining({ instagramUserId: "123", accessToken: "long-secret", username: "business" }));
  });

  it("rejects expired and replayed state", async () => {
    const { service, fetchMeta } = setup();
    await expect(service.finish("owner-1", "missing", "code")).rejects.toMatchObject({ code: "INSTAGRAM_OAUTH_STATE_INVALID" });
    await service.start("owner-1");
    await service.finish("owner-1", "state-1", "code");
    await expect(service.finish("owner-1", "state-1", "code")).rejects.toMatchObject({ code: "INSTAGRAM_OAUTH_STATE_INVALID" });
    expect(fetchMeta).toHaveBeenCalledTimes(3);
  });

  it("consumes a cancelled state without making a provider call", async () => {
    const { service, fetchMeta } = setup();
    await service.start("owner-1");
    await service.cancel("owner-1", "state-1");
    await expect(service.finish("owner-1", "state-1", "code")).rejects.toMatchObject({ code: "INSTAGRAM_OAUTH_STATE_INVALID" });
    expect(fetchMeta).not.toHaveBeenCalled();
  });

  it("rejects a callback by a different user before exchanging code", async () => {
    const { service, fetchMeta } = setup();
    await service.start("owner-1");
    await expect(service.finish("owner-2", "state-1", "code")).rejects.toMatchObject({ code: "INSTAGRAM_OAUTH_STATE_INVALID" });
    expect(fetchMeta).not.toHaveBeenCalled();
  });

  it("maps provider failure to a safe code without exposing response secrets", async () => {
    const { service, fetchMeta } = setup();
    fetchMeta.mockResolvedValueOnce(new Response(JSON.stringify({ error_message: "provider-secret" }), { status: 400 }));
    await service.start("owner-1");
    await expect(service.finish("owner-1", "state-1", "code")).rejects.toMatchObject({ code: "INSTAGRAM_OAUTH_CODE_EXCHANGE_FAILED", message: expect.not.stringContaining("provider-secret") });
  });
});
