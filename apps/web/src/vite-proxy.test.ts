import { describe, expect, it } from "vitest";
import config from "../vite.config.js";

describe("production-origin proxy", () => {
  it("preserves the browser Host for API and Socket.IO requests", () => {
    const proxy = config.server?.proxy as Record<string, { changeOrigin?: boolean }>;

    expect(proxy["/api"]?.changeOrigin).toBe(false);
    expect(proxy["/socket.io"]?.changeOrigin).toBe(false);
  });
});
