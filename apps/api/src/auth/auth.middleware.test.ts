import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyAccessToken = vi.hoisted(() => vi.fn());
vi.mock("../services/auth.service.js", () => ({ verifyAccessToken }));

import { errorHandler } from "../common/errors.js";
import { authenticate } from "./auth.middleware.js";

function app() {
  const server = express();
  server.get("/protected", authenticate, (request, response) => response.json({ user: (request as typeof request & { auth?: unknown }).auth }));
  server.use(errorHandler);
  return server;
}

describe("HTTP authentication", () => {
  beforeEach(() => vi.resetAllMocks());

  it("prefers the access cookie over an Authorization header", async () => {
    verifyAccessToken.mockResolvedValue({ id: "cookie-user", email: "cookie@example.com", role: "agent" });

    const response = await request(app())
      .get("/protected")
      .set("Cookie", "nhuu_access_token=cookie-token")
      .set("Authorization", "Bearer old-token");

    expect(response.status).toBe(200);
    expect(verifyAccessToken).toHaveBeenCalledWith("cookie-token");
  });

  it("keeps Bearer authentication as a migration fallback", async () => {
    verifyAccessToken.mockResolvedValue({ id: "bearer-user", email: "bearer@example.com", role: "agent" });

    const response = await request(app()).get("/protected").set("Authorization", "Bearer bearer-token");

    expect(response.status).toBe(200);
    expect(verifyAccessToken).toHaveBeenCalledWith("bearer-token");
  });
});
