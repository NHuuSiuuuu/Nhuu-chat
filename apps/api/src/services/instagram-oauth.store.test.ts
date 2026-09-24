import { describe, expect, it, vi } from "vitest";

import { RedisInstagramOAuthStore } from "./instagram-oauth.store.js";

describe("Instagram OAuth state store", () => {
  it("uses a distinct encrypted one-time Redis key with a TTL", async () => {
    const values = new Map<string, string>();
    const client = {
      isReady: true,
      on: vi.fn(),
      set: vi.fn(async (key: string, value: string) => { values.set(key, value); return "OK"; }),
      getDel: vi.fn(async (key: string) => { const value = values.get(key); values.delete(key); return value; })
    };
    const store = new RedisInstagramOAuthStore(client as never);
    await store.save("state-1", { userId: "owner-1" }, 600);
    expect(client.set).toHaveBeenCalledWith("nhuu-chat:instagram-oauth:state-1", expect.not.stringContaining("owner-1"), { EX: 600 });
    expect(await store.consume("state-1")).toEqual({ userId: "owner-1" });
    expect(await store.consume("state-1")).toBeUndefined();
  });
});
