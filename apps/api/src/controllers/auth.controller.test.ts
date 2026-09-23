import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const services = vi.hoisted(() => ({
  register: vi.fn(),
  login: vi.fn(),
  rotateRefreshToken: vi.fn(),
  revokeRefreshToken: vi.fn()
}));
const passwordReset = vi.hoisted(() => ({ resetPassword: vi.fn() }));
const sockets = vi.hoisted(() => ({ disconnectAuthSession: vi.fn(), disconnectAuthUser: vi.fn() }));
vi.mock("../services/auth.service.js", () => services);
vi.mock("../services/password-reset.service.js", () => passwordReset);
vi.mock("../realtime/socket.js", () => sockets);

import { errorHandler } from "../common/errors.js";
import { login, logout, refresh, register, resetPasswordController, session } from "./auth.controller.js";

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.post("/register", register);
  app.post("/login", login);
  app.post("/refresh", refresh);
  app.post("/session", session);
  app.post("/logout", logout);
  app.post("/reset-password", resetPasswordController);
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

  it.each(endpoints)("preserves the pre-validation %s failure when no body was parsed", async (path) => {
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

  it("disconnects only a newly revoked session after logout", async () => {
    services.revokeRefreshToken.mockResolvedValue("session-a");
    const response = await request(createTestApp()).post("/logout")
      .set("Cookie", "nhuu_refresh_token=refresh-a");

    expect(response.status).toBe(204);
    expect(services.revokeRefreshToken).toHaveBeenCalledWith("refresh-a");
    expect(sockets.disconnectAuthSession).toHaveBeenCalledExactlyOnceWith("session-a");
    expect(sockets.disconnectAuthUser).not.toHaveBeenCalled();
  });

  it("clears cookies without disconnecting for a legacy or missing refresh token", async () => {
    services.revokeRefreshToken.mockResolvedValue(undefined);
    const app = createTestApp();
    const legacy = await request(app).post("/logout").set("Cookie", "nhuu_refresh_token=legacy-refresh");
    const missing = await request(app).post("/logout");

    expect(legacy.status).toBe(204);
    expect(missing.status).toBe(204);
    expect(services.revokeRefreshToken).toHaveBeenCalledTimes(1);
    expect(sockets.disconnectAuthSession).not.toHaveBeenCalled();
    expect(sockets.disconnectAuthUser).not.toHaveBeenCalled();
    for (const response of [legacy, missing]) {
      expect(response.headers["set-cookie"]).toEqual([
        expect.stringContaining("nhuu_access_token=;"),
        expect.stringContaining("nhuu_refresh_token=;")
      ]);
    }
  });

  it("disconnects all user sockets only after a successful password reset", async () => {
    passwordReset.resetPassword.mockResolvedValue("user-1");
    const response = await request(createTestApp()).post("/reset-password")
      .send({ token: "reset-token", password: "new-password-123" });

    expect(response.status).toBe(204);
    expect(passwordReset.resetPassword).toHaveBeenCalledWith("reset-token", "new-password-123");
    expect(sockets.disconnectAuthUser).toHaveBeenCalledExactlyOnceWith("user-1");
    expect(response.headers["set-cookie"]).toEqual([
      expect.stringContaining("nhuu_access_token=;"),
      expect.stringContaining("nhuu_refresh_token=;")
    ]);
  });

  it("does not disconnect users when password reset fails", async () => {
    passwordReset.resetPassword.mockRejectedValue(new Error("transaction failed"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await request(createTestApp()).post("/reset-password")
      .send({ token: "reset-token", password: "new-password-123" });

    expect(response.status).toBe(500);
    expect(sockets.disconnectAuthUser).not.toHaveBeenCalled();
  });
});
