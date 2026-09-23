import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const services = vi.hoisted(() => ({
  register: vi.fn(),
  login: vi.fn(),
  rotateRefreshToken: vi.fn(),
  revokeRefreshToken: vi.fn()
}));
vi.mock("../services/auth.service.js", () => services);

import { errorHandler } from "../common/errors.js";
import { login, logout, refresh, register, session } from "./auth.controller.js";

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.post("/register", register);
  app.post("/login", login);
  app.post("/refresh", refresh);
  app.post("/session", session);
  app.post("/logout", logout);
  app.use(errorHandler);
  return app;
}

const endpoints = [
  ["register", "Name, email and a password of at least 8 characters are required"],
  ["login", "Email and password are required"]
] as const;

describe("auth controller baseline contracts", () => {
  beforeEach(() => vi.resetAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it.each(endpoints)("preserves the explicit %s validation error", async (path, message) => {
    const response = await request(createTestApp()).post(`/${path}`).send({});

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: { code: "INVALID_REQUEST", message } });
    for (const service of Object.values(services)) expect(service).not.toHaveBeenCalled();
  });

  it.each([
    ["register", { name: " ", email: "a@example.com", password: "password" }],
    ["register", { name: "A", email: " ", password: "password" }],
    ["register", { name: "A", email: "a@example.com", password: "1234567" }],
    ["register", { name: "A", email: "a@example.com", password: 12345678 }],
    ["login", { email: "", password: "password" }],
    ["login", { email: "a@example.com", password: 123 }]
  ])("keeps malformed %s credentials at 400 (%#)", async (path, body) => {
    const response = await request(createTestApp()).post(`/${path}`).send(body);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_REQUEST");
    for (const service of Object.values(services)) expect(service).not.toHaveBeenCalled();
  });

  it.each(endpoints.filter(([path]) => path !== "refresh"))("preserves the pre-validation %s failure when no body was parsed", async (path) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await request(createTestApp()).post(`/${path}`);

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" }
    });
    for (const service of Object.values(services)) expect(service).not.toHaveBeenCalled();
  });

  it("returns the registered user and sets HttpOnly cookies without returning tokens", async () => {
    services.register.mockResolvedValue({
      user: { id: "user-1", email: "a@example.com", role: "customer" },
      tokens: { accessToken: "access", refreshToken: "refresh" }
    });
    const response = await request(createTestApp()).post("/register").send({
      name: " A ", email: " a@example.com ", password: "password"
    });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ user: { id: "user-1", email: "a@example.com", role: "customer" } });
    expect(response.headers["set-cookie"]).toEqual([
      expect.stringContaining("nhuu_access_token=access"),
      expect.stringContaining("nhuu_refresh_token=refresh")
    ]);
  });

  it("refreshes from the HttpOnly cookie and returns only the user", async () => {
    services.rotateRefreshToken.mockResolvedValue({
      user: { id: "user-1", email: "a@example.com", role: "customer" },
      tokens: { accessToken: "next-access", refreshToken: "next-refresh" }
    });

    const response = await request(createTestApp()).post("/refresh").set("Cookie", "nhuu_refresh_token=old-refresh");

    expect(response.status).toBe(200);
    expect(services.rotateRefreshToken).toHaveBeenCalledWith("old-refresh");
    expect(response.body).toEqual({ user: { id: "user-1", email: "a@example.com", role: "customer" } });
    expect(response.headers["set-cookie"]).toEqual([
      expect.stringContaining("nhuu_access_token=next-access"),
      expect.stringContaining("nhuu_refresh_token=next-refresh")
    ]);
  });

  it("returns 401 when refresh cookie is missing", async () => {
    const response = await request(createTestApp()).post("/refresh");

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: { code: "AUTHENTICATION_REQUIRED", message: "Refresh token is required" } });
  });

  it("returns the session user without token material", async () => {
    const app = express();
    app.use((request, _response, next) => {
      (request as { auth?: unknown }).auth = { id: "user-1", email: "a@example.com", role: "customer", sessionId: "private-session" };
      next();
    });
    app.post("/session", session);

    const response = await request(app).post("/session");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ user: { id: "user-1", email: "a@example.com", role: "customer" } });
  });

  it("always clears auth cookies during logout", async () => {
    const response = await request(createTestApp()).post("/logout").set("Cookie", "nhuu_refresh_token=old-refresh");

    expect(response.status).toBe(204);
    expect(services.revokeRefreshToken).toHaveBeenCalledWith("old-refresh");
    expect(response.headers["set-cookie"]).toEqual([
      expect.stringContaining("nhuu_access_token=;"),
      expect.stringContaining("nhuu_refresh_token=;")
    ]);
  });
});
