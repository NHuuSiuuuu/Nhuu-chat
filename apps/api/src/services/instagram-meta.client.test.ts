import { describe, expect, it, vi } from "vitest";

import { InstagramMetaClient } from "./instagram-meta.client.js";

describe("Instagram Meta client", () => {
  it("refreshes long-lived token using the Instagram Graph endpoint", async () => {
    const fetchMeta = vi.fn(async (_input: string, _init?: RequestInit) => new Response(JSON.stringify({ access_token: "replacement", expires_in: 3600 })));
    const client = new InstagramMetaClient(fetchMeta);
    await expect(client.refreshLongToken("old-secret")).resolves.toMatchObject({ accessToken: "replacement" });
    const url = new URL(fetchMeta.mock.calls[0][0]);
    expect(url.origin + url.pathname).toBe("https://graph.instagram.com/refresh_access_token");
    expect(url.searchParams.get("grant_type")).toBe("ig_refresh_token");
  });

  it("subscribes only the messages field for the canonical account ID", async () => {
    const fetchMeta = vi.fn(async (_input: string, _init?: RequestInit) => new Response(JSON.stringify({ success: true })));
    const client = new InstagramMetaClient(fetchMeta, "v26.0");
    await client.subscribe("123", "secret");
    const url = new URL(fetchMeta.mock.calls[0][0]);
    expect(url.pathname).toBe("/v26.0/123/subscribed_apps");
    expect(url.searchParams.get("subscribed_fields")).toBe("messages");
    expect(fetchMeta.mock.calls[0][1]).toMatchObject({ method: "POST", headers: { authorization: "Bearer secret" } });
  });

  it("takes the canonical account ID from user_id rather than the app-scoped id", async () => {
    const fetchMeta = vi.fn(async (_input: string, _init?: RequestInit) => new Response(JSON.stringify({ id: "scoped-999", user_id: "123", username: "business" })));
    const client = new InstagramMetaClient(fetchMeta, "v26.0");
    await expect(client.profile("secret", "123")).resolves.toMatchObject({ instagramUserId: "123" });
    expect(new URL(fetchMeta.mock.calls[0][0]).searchParams.get("fields")).toContain("user_id");
  });
});
