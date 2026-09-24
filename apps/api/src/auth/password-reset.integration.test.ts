import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const serviceMocks = vi.hoisted(() => ({ requestPasswordReset: vi.fn(), resetPassword: vi.fn() }));
vi.mock("../services/password-reset.service.js", () => serviceMocks);

import { createApp } from "../app.js";

describe("password reset routes", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns the same accepted response for requests whether or not the account exists", async () => {
    serviceMocks.requestPasswordReset.mockResolvedValue(undefined);
    const app = createApp();
    const existing = await request(app).post("/api/v1/auth/forgot-password").send({ email: "member@example.com" });
    const unknown = await request(app).post("/api/v1/auth/forgot-password").send({ email: "unknown@example.com" });

    expect(existing.status).toBe(202);
    expect(unknown.status).toBe(existing.status);
    expect(unknown.body).toEqual(existing.body);
    expect(existing.body).toEqual({ message: "If an account exists for this email, you will receive a password reset link." });
  });

  it("rejects malformed requests and short passwords", async () => {
    const app = createApp();
    const invalidEmail = await request(app).post("/api/v1/auth/forgot-password").send({ email: "not-an-email" });
    const shortPassword = await request(app).post("/api/v1/auth/reset-password").send({ token: "token", password: "short" });

    expect(invalidEmail.status).toBe(400);
    expect(invalidEmail.body.error.code).toBe("INVALID_REQUEST");
    expect(shortPassword.status).toBe(400);
    expect(shortPassword.body.error.code).toBe("INVALID_REQUEST");
    expect(serviceMocks.requestPasswordReset).not.toHaveBeenCalled();
    expect(serviceMocks.resetPassword).not.toHaveBeenCalled();
  });

  it("resets a password without creating a logged-in session", async () => {
    serviceMocks.resetPassword.mockResolvedValue(undefined);

    const response = await request(createApp()).post("/api/v1/auth/reset-password").send({
      token: "raw-reset-token",
      password: "new-password-123"
    });

    expect(response.status).toBe(204);
    const cookies = response.headers["set-cookie"];
    expect(Array.isArray(cookies)).toBe(true);
    if (!Array.isArray(cookies)) throw new Error("Expected both password-reset cookies to be cleared");
    expect(cookies).toHaveLength(2);
    expect(cookies.every((cookie) => cookie.includes("Max-Age=0"))).toBe(true);
    expect(serviceMocks.resetPassword).toHaveBeenCalledWith("raw-reset-token", "new-password-123");
  });

  it("limits five forgot-password requests per fifteen minutes per client IP", async () => {
    serviceMocks.requestPasswordReset.mockResolvedValue(undefined);
    const app = createApp();
    const sameClient = "198.51.100.10";
    for (let index = 0; index < 5; index += 1) {
      const response = await request(app)
        .post("/api/v1/auth/forgot-password")
        .set("X-Forwarded-For", sameClient)
        .send({ email: `member-${index}@example.com` });
      expect(response.status).toBe(202);
    }
    const blocked = await request(app)
      .post("/api/v1/auth/forgot-password")
      .set("X-Forwarded-For", sameClient)
      .send({ email: "sixth@example.com" });
    const otherClient = await request(app)
      .post("/api/v1/auth/forgot-password")
      .set("X-Forwarded-For", "198.51.100.11")
      .send({ email: "other@example.com" });

    expect(blocked.status).toBe(429);
    expect(otherClient.status).toBe(202);
  });
});
