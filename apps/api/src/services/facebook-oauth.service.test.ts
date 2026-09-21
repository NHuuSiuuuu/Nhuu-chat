import { beforeAll, describe, expect, it, vi } from "vitest";

import type { FacebookOAuthStoredValue, FacebookOAuthStore } from "./facebook-oauth.service.js";

let FacebookOAuthService: typeof import("./facebook-oauth.service.js").FacebookOAuthService;

beforeAll(async () => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("MONGODB_URI", "mongodb://localhost:27017/nhuu-chat");
  vi.stubEnv("REDIS_URL", "redis://localhost:6379");
  vi.stubEnv("JWT_SECRET", "a-jwt-secret-that-is-at-least-32-characters");
  vi.stubEnv("ENCRYPTION_KEY", "an-encryption-key-that-is-32-characters");
  vi.stubEnv("TELEGRAM_BOT_TOKEN", "123456789:test-token");
  vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "a-telegram-webhook-secret");
  vi.stubEnv("WEB_ALLOWED_ORIGINS", "http://localhost:5173");
  ({ FacebookOAuthService } = await import("./facebook-oauth.service.js"));
});

interface TestFacebookOAuthStore extends FacebookOAuthStore {
  saved: Array<{ token: string; value: FacebookOAuthStoredValue; ttlSeconds: number }>;
  read(token: string): Promise<FacebookOAuthStoredValue | undefined>;
  claim(token: string, claimToken: string, ttlSeconds: number): Promise<FacebookOAuthStoredValue | undefined>;
  releaseClaim(token: string, claimToken: string): Promise<void>;
  consumeClaim(token: string, claimToken: string): Promise<FacebookOAuthStoredValue | undefined>;
  consumeCalls: string[];
}

function store(): TestFacebookOAuthStore {
  const values = new Map<string, FacebookOAuthStoredValue>();
  const claims = new Map<string, string>();
  const saved: Array<{ token: string; value: FacebookOAuthStoredValue; ttlSeconds: number }> = [];
  const consumeCalls: string[] = [];
  return {
    saved,
    consumeCalls,
    async save(token, value, ttlSeconds) {
      values.set(token, value);
      saved.push({ token, value, ttlSeconds });
    },
    async read(token) {
      return values.get(token);
    },
    async claim(token, claimToken) {
      const value = values.get(token);
      if (!value || claims.has(token)) return undefined;
      claims.set(token, claimToken);
      return value;
    },
    async releaseClaim(token, claimToken) {
      if (claims.get(token) === claimToken) claims.delete(token);
    },
    async consumeClaim(token, claimToken) {
      if (claims.get(token) !== claimToken) return undefined;
      claims.delete(token);
      consumeCalls.push(token);
      const value = values.get(token);
      values.delete(token);
      return value;
    },
    async consume(token) {
      consumeCalls.push(token);
      const value = values.get(token);
      values.delete(token);
      return value;
    }
  };
}

describe("FacebookOAuthService", () => {
  it("creates a CSRF-bound authorization URL without changing manual connection behavior", async () => {
    const stateStore = store();
    const service = new FacebookOAuthService({
      appId: "meta-app-id",
      appSecret: "meta-app-secret",
      redirectUri: "https://api.example.com/api/v1/facebook-page/oauth/callback",
      graphApiVersion: "v26.0",
      stateStore,
      randomToken: () => "state-token"
    });

    const result = await service.start("user-1");
    const url = new URL(result.authorizationUrl);

    expect(url.origin).toBe("https://www.facebook.com");
    expect(url.pathname).toBe("/v26.0/dialog/oauth");
    expect(url.searchParams.get("client_id")).toBe("meta-app-id");
    expect(url.searchParams.get("state")).toBe("state-token");
    expect(url.searchParams.get("redirect_uri")).toBe("https://api.example.com/api/v1/facebook-page/oauth/callback");
    expect(url.searchParams.get("scope")).toContain("pages_show_list");
    expect(stateStore.saved).toEqual([
      { token: "state-token", value: { kind: "oauth", userId: "user-1" }, ttlSeconds: 600 }
    ]);
  });

  it("exchanges the callback code and stores page access tokens outside the browser response", async () => {
    const stateStore = store();
    await stateStore.save("state-token", { kind: "oauth", userId: "user-1" }, 600);
    const fetchGraph = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "user-token" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [
          { id: "page-1", name: "Page One", access_token: "page-token-1", tasks: ["CREATE_CONTENT"] },
          { id: "page-2", name: "Page Two", access_token: "page-token-2", tasks: ["MODERATE_CONTENT"] }
        ]
      }), { status: 200 }));
    const service = new FacebookOAuthService({
      appId: "meta-app-id",
      appSecret: "meta-app-secret",
      redirectUri: "https://api.example.com/api/v1/facebook-page/oauth/callback",
      graphApiVersion: "v26.0",
      stateStore,
      fetchGraph,
      randomToken: () => "selection-token"
    });

    const result = await service.finish("state-token", "authorization-code");

    expect(result.userId).toBe("user-1");
    expect(result.selectionToken).toBe("selection-token");
    expect(result.pages).toEqual([
      { id: "page-1", name: "Page One", canPublish: true },
      { id: "page-2", name: "Page Two", canPublish: false }
    ]);
    expect(JSON.stringify(result.pages)).not.toContain("page-token");
    expect(stateStore.saved.at(-1)).toEqual({
      token: "selection-token",
      value: {
        kind: "selection",
        userId: "user-1",
        pages: [
          { id: "page-1", name: "Page One", accessToken: "page-token-1", canPublish: true },
          { id: "page-2", name: "Page Two", accessToken: "page-token-2", canPublish: false }
        ]
      },
      ttlSeconds: 600
    });
  });

  it("follows Graph pagination and redacts Page tokens from the browser response", async () => {
    const stateStore = store();
    await stateStore.save("state-token", { kind: "oauth", userId: "user-1" }, 600);
    const nextUrl = "https://graph.facebook.com/v26.0/me/accounts?after=cursor-1&access_token=user-token";
    const fetchGraph = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "user-token" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{ id: "page-1", name: "Page One", access_token: "page-token-1", tasks: ["CREATE_CONTENT"] }],
        paging: { next: nextUrl }
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{ id: "page-2", name: "Page Two", access_token: "page-token-2", tasks: ["MODERATE_CONTENT"] }]
      }), { status: 200 }));
    const service = new FacebookOAuthService({
      appId: "meta-app-id",
      appSecret: "meta-app-secret",
      redirectUri: "https://api.example.com/api/v1/facebook-page/oauth/callback",
      graphApiVersion: "v26.0",
      stateStore,
      fetchGraph,
      randomToken: () => "selection-token"
    });

    const result = await service.finish("state-token", "authorization-code");

    expect(result.pages).toEqual([
      { id: "page-1", name: "Page One", canPublish: true },
      { id: "page-2", name: "Page Two", canPublish: false }
    ]);
    expect(fetchGraph).toHaveBeenCalledTimes(3);
    expect(fetchGraph.mock.calls[2]?.[0]).toBe(nextUrl);
    expect(JSON.stringify(result)).not.toContain("user-token");
    expect(JSON.stringify(result)).not.toContain("page-token");
    expect(stateStore.saved.at(-1)?.value).toMatchObject({
      kind: "selection",
      pages: [
        { id: "page-1", accessToken: "page-token-1" },
        { id: "page-2", accessToken: "page-token-2" }
      ]
    });
  });

  it("rejects non-Graph pagination URLs with a sanitized pages error", async () => {
    const stateStore = store();
    await stateStore.save("state-token", { kind: "oauth", userId: "user-1" }, 600);
    const fetchGraph = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "user-token" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [],
        paging: { next: "https://graph.facebook.com.evil.example/me/accounts?access_token=stolen-token" }
      }), { status: 200 }));
    const service = new FacebookOAuthService({
      appId: "meta-app-id",
      appSecret: "meta-app-secret",
      redirectUri: "https://api.example.com/api/v1/facebook-page/oauth/callback",
      stateStore,
      fetchGraph
    });

    const error = await service.finish("state-token", "authorization-code").catch((caught: unknown) => caught);

    expect(error).toMatchObject({ code: "FACEBOOK_OAUTH_PAGES_FAILED", message: "Facebook OAuth request failed" });
    expect(fetchGraph).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(error)).not.toContain("stolen-token");
    expect(stateStore.saved).toHaveLength(1);
  });

  it("sanitizes failures while fetching a later Graph Page", async () => {
    const stateStore = store();
    await stateStore.save("state-token", { kind: "oauth", userId: "user-1" }, 600);
    const fetchGraph = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "user-token" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [],
        paging: { next: "https://graph.facebook.com/v26.0/me/accounts?after=cursor-1&access_token=user-token" }
      }), { status: 200 }))
      .mockRejectedValueOnce(new Error("request failed with access_token=user-token"));
    const service = new FacebookOAuthService({
      appId: "meta-app-id",
      appSecret: "meta-app-secret",
      redirectUri: "https://api.example.com/api/v1/facebook-page/oauth/callback",
      stateStore,
      fetchGraph
    });

    const error = await service.finish("state-token", "authorization-code").catch((caught: unknown) => caught);

    expect(error).toMatchObject({ code: "FACEBOOK_OAUTH_PAGES_FAILED", message: "Facebook OAuth request failed" });
    expect(JSON.stringify(error)).not.toContain("user-token");
    expect(stateStore.saved).toHaveLength(1);
  });

  it("stops Graph pagination after 25 pages with a sanitized pages error", async () => {
    const stateStore = store();
    await stateStore.save("state-token", { kind: "oauth", userId: "user-1" }, 600);
    const fetchGraph = vi.fn(async (input: string) => {
      const url = new URL(input);
      if (url.pathname.endsWith("/oauth/access_token")) {
        return new Response(JSON.stringify({ access_token: "user-token" }), { status: 200 });
      }
      const cursor = Number(url.searchParams.get("after") ?? "0");
      return new Response(JSON.stringify({
        data: [],
        paging: { next: `https://graph.facebook.com/v26.0/me/accounts?after=${cursor + 1}&access_token=user-token` }
      }), { status: 200 });
    });
    const service = new FacebookOAuthService({
      appId: "meta-app-id",
      appSecret: "meta-app-secret",
      redirectUri: "https://api.example.com/api/v1/facebook-page/oauth/callback",
      stateStore,
      fetchGraph
    });

    const error = await service.finish("state-token", "authorization-code").catch((caught: unknown) => caught);

    expect(error).toMatchObject({ code: "FACEBOOK_OAUTH_PAGES_FAILED", message: "Facebook OAuth request failed" });
    expect(fetchGraph).toHaveBeenCalledTimes(26);
    expect(JSON.stringify(error)).not.toContain("user-token");
    expect(stateStore.saved).toHaveLength(1);
  });

  it("reads the same selection concurrently without consuming it or extending its fixed expiry", async () => {
    const stateStore = store();
    await stateStore.save("selection-token", {
      kind: "selection",
      userId: "user-1",
      pages: [{ id: "page-1", name: "Page One", accessToken: "page-token-1", canPublish: true }]
    }, 600);
    const service = new FacebookOAuthService({ stateStore });

    const [first, second] = await Promise.all([
      service.getSelection("user-1", "selection-token"),
      service.getSelection("user-1", "selection-token")
    ]);

    expect(first).toEqual([{ id: "page-1", name: "Page One", canPublish: true }]);
    expect(second).toEqual(first);
    expect(stateStore.saved).toHaveLength(1);
    expect(stateStore.consumeCalls).toEqual([]);
  });

  it("does not invalidate a selection when a different owner tries to select a Page", async () => {
    const stateStore = store();
    await stateStore.save("selection-token", {
      kind: "selection",
      userId: "user-1",
      pages: [{ id: "page-1", name: "Page One", accessToken: "page-token-1", canPublish: true }]
    }, 600);
    const service = new FacebookOAuthService({ stateStore });
    const connect = vi.fn().mockResolvedValue({ id: "connection-1" });

    await expect(service.select("user-2", "selection-token", "page-1", connect)).rejects.toMatchObject({
      code: "FACEBOOK_OAUTH_SELECTION_INVALID"
    });
    await expect(service.select("user-1", "selection-token", "page-1", connect)).resolves.toEqual({ id: "connection-1" });

    expect(connect).toHaveBeenCalledOnce();
    expect(stateStore.consumeCalls).toEqual(["selection-token"]);
  });

  it("keeps the selection retryable when connection persistence fails", async () => {
    const stateStore = store();
    await stateStore.save("selection-token", {
      kind: "selection",
      userId: "user-1",
      pages: [{ id: "page-1", name: "Page One", accessToken: "page-token-1", canPublish: true }]
    }, 600);
    const service = new FacebookOAuthService({ stateStore });
    const connect = vi.fn()
      .mockRejectedValueOnce(new Error("persistence failed"))
      .mockResolvedValueOnce({ id: "connection-1" });

    await expect(service.select("user-1", "selection-token", "page-1", connect)).rejects.toThrow("persistence failed");
    expect(stateStore.consumeCalls).toEqual([]);

    await expect(service.select("user-1", "selection-token", "page-1", connect)).resolves.toEqual({ id: "connection-1" });
    await expect(service.select("user-1", "selection-token", "page-1", connect)).rejects.toMatchObject({
      code: "FACEBOOK_OAUTH_SELECTION_INVALID"
    });

    expect(connect).toHaveBeenCalledTimes(2);
    expect(stateStore.consumeCalls).toEqual(["selection-token"]);
  });

  it("allows only one concurrent selection request to reach connection persistence", async () => {
    const stateStore = store();
    await stateStore.save("selection-token", {
      kind: "selection",
      userId: "user-1",
      pages: [{ id: "page-1", name: "Page One", accessToken: "page-token-1", canPublish: true }]
    }, 600);
    let markConnectionStarted: (() => void) | undefined;
    const connectionStarted = new Promise<void>((resolve) => {
      markConnectionStarted = resolve;
    });
    let releaseConnection: (() => void) | undefined;
    const connectionGate = new Promise<void>((resolve) => {
      releaseConnection = resolve;
    });
    const connect = vi.fn(async () => {
      if (connect.mock.calls.length === 1) {
        markConnectionStarted?.();
        await connectionGate;
      }
      return { id: "connection-1" };
    });
    const randomToken = vi.fn()
      .mockReturnValueOnce("claim-1")
      .mockReturnValueOnce("claim-2");
    const service = new FacebookOAuthService({ stateStore, randomToken });

    const first = service.select("user-1", "selection-token", "page-1", connect);
    await connectionStarted;
    const second = service.select("user-1", "selection-token", "page-1", connect);

    try {
      await expect(second).rejects.toMatchObject({ code: "FACEBOOK_OAUTH_SELECTION_INVALID" });
    } finally {
      releaseConnection?.();
    }
    await expect(first).resolves.toEqual({ id: "connection-1" });
    expect(connect).toHaveBeenCalledOnce();
    expect(stateStore.consumeCalls).toEqual(["selection-token"]);
  });
});
