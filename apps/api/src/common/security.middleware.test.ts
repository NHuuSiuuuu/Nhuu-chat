import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

import { corsAllowlist, originProtection } from "./security.middleware.js";

function app() {
  const server = express();
  server.use(corsAllowlist);
  server.use(originProtection);
  server.post("/mutate", (_request, response) => response.json({ ok: true }));
  return server;
}

afterEach(() => vi.unstubAllEnvs());

describe("CORS and CSRF origin protection", () => {
  it("rejects a mutation from an origin outside the allowlist", async () => {
    vi.stubEnv("WEB_ALLOWED_ORIGINS", "https://app.example.com");

    const response = await request(app()).post("/mutate").set("Origin", "https://evil.example.com");

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("CSRF_ORIGIN_REJECTED");
  });

  it("allows a valid preflight with credentials and requested headers", async () => {
    vi.stubEnv("WEB_ALLOWED_ORIGINS", "https://app.example.com");

    const response = await request(app())
      .options("/mutate")
      .set("Origin", "https://app.example.com")
      .set("Access-Control-Request-Headers", "Content-Type, X-Request-Id");

    expect(response.status).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe("https://app.example.com");
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
    expect(response.headers["access-control-allow-headers"]).toContain("X-Request-Id");
    expect(response.headers["access-control-allow-methods"]).toContain("PUT");
  });
});
