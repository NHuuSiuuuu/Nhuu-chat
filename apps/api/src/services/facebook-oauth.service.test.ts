import { beforeAll, describe, expect, it, vi } from "vitest";

import type { FacebookOAuthStore } from "./facebook-oauth.service.js";

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

function store(): FacebookOAuthStore & { saved: Array<{ token: string; value: unknown; ttlSeconds: number }> } {
  const values = new Map<string, unknown>();
  const saved: Array<{ token: string; value: unknown; ttlSeconds: number }> = [];
  return {
    saved,
    async save(token, value, ttlSeconds) {
      values.set(token, value);
      saved.push({ token, value, ttlSeconds });
    },
    async consume(token) {
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
});
