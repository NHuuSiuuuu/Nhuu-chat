import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app.js";
import { requireRole } from "./auth.middleware.js";
import { hashPassword } from "../services/auth.service.js";
import { verifyAccessToken } from "../services/auth.service.js";
import { UserModel } from "../models/user.model.js";
import { startTestDatabase, stopTestDatabase } from "../test/mongo-repl-set.js";

process.env.JWT_SECRET ??= "test-jwt-secret-that-is-at-least-32-characters";

describe("authentication and roles", () => {
  beforeAll(async () => {
    await startTestDatabase();
    await UserModel.syncIndexes();
  }, 120_000);

  beforeEach(async () => {
    await UserModel.deleteMany({});
  });

  afterAll(async () => {
    await stopTestDatabase();
  }, 30_000);

  it("registers a normalized customer and returns safe user tokens", async () => {
    const response = await request(createApp()).post("/api/v1/auth/register").send({
      name: "New Customer",
      email: "  NEW.Customer@Example.COM ",
      password: "correct horse battery staple",
      role: "admin"
    });

    expect(response.status).toBe(201);
    expect(response.body.user).toMatchObject({ email: "new.customer@example.com", role: "customer" });
    expect(response.body.user).not.toHaveProperty("passwordHash");
    expect(response.body).toMatchObject({
      accessToken: expect.any(String),
      refreshToken: expect.any(String)
    });
    await expect(verifyAccessToken(response.body.accessToken)).resolves.toMatchObject({
      email: "new.customer@example.com",
      role: "customer"
    });

    const document = await UserModel.findOne({ email: "new.customer@example.com" }).select(
      "+passwordHash"
    );
    expect(document).not.toBeNull();
    expect(document?.role).toBe("customer");
    expect(document?.passwordHash).not.toBe("correct horse battery staple");
  });

  it("rejects invalid registration fields", async () => {
    for (const body of [
      { email: "user@example.com", password: "correct horse battery staple" },
      { name: "Customer", password: "correct horse battery staple" },
      { name: "Customer", email: "user@example.com" },
      { name: "Customer", email: "user@example.com", password: "short" }
    ]) {
      const response = await request(createApp()).post("/api/v1/auth/register").send(body);

      expect(response.status).toBe(400);
      expect(response.body.error).toMatchObject({ code: "INVALID_REQUEST" });
    }
  });

  it("rejects duplicate registration emails with a stable conflict error", async () => {
    const first = await request(createApp()).post("/api/v1/auth/register").send({
      name: "First Customer",
      email: "customer@example.com",
      password: "correct horse battery staple"
    });
    const duplicate = await request(createApp()).post("/api/v1/auth/register").send({
      name: "Second Customer",
      email: " CUSTOMER@example.com ",
      password: "another correct password"
    });

    expect(first.status).toBe(201);
    expect(duplicate.status).toBe(409);
    expect(duplicate.body).toEqual({
      error: { code: "DUPLICATE_RESOURCE", message: "Resource already exists" }
    });
  });

  it("logs in with a valid password without exposing the password hash", async () => {
    await UserModel.create({
      email: "admin@example.com",
      name: "Admin",
      passwordHash: await hashPassword("correct horse battery staple"),
      role: "admin"
    });

    const response = await request(createApp()).post("/api/v1/auth/login").send({
      email: "ADMIN@example.com",
      password: "correct horse battery staple"
    });

    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({ email: "admin@example.com", role: "admin" });
    expect(response.body.user).not.toHaveProperty("passwordHash");
    expect(response.body).toMatchObject({
      accessToken: expect.any(String),
      refreshToken: expect.any(String)
    });
  });

  it("reissues a refresh token with the user's current role and rejects replay", async () => {
    await UserModel.create({
      email: "agent@example.com",
      name: "Agent",
      passwordHash: await hashPassword("correct horse battery staple"),
      role: "agent"
    });

    const login = await request(createApp()).post("/api/v1/auth/login").send({
      email: "agent@example.com",
      password: "correct horse battery staple"
    });
    const oldRefreshToken = login.body.refreshToken as string;

    await UserModel.updateOne({ email: "agent@example.com" }, { $set: { role: "customer" } });

    const refreshed = await request(createApp())
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: oldRefreshToken });
    const replay = await request(createApp())
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: oldRefreshToken });

    expect(refreshed.status).toBe(200);
    expect(refreshed.body.refreshToken).not.toBe(oldRefreshToken);
    await expect(verifyAccessToken(refreshed.body.accessToken)).resolves.toMatchObject({
      email: "agent@example.com",
      role: "customer"
    });
    expect(replay.status).toBe(401);
  });

  it("enforces the admin-only role matrix", async () => {
    const app = createApp();
    app.get("/admin-only", requireRole("admin"), (_request, response) => {
      response.status(200).json({ allowed: true });
    });

    for (const role of ["admin", "agent", "customer"] as const) {
      await UserModel.create({
        email: `${role}@example.com`,
        name: role,
        passwordHash: await hashPassword("correct horse battery staple"),
        role
      });
    }

    const tokens = new Map<string, string>();
    for (const role of ["admin", "agent", "customer"] as const) {
      const login = await request(createApp()).post("/api/v1/auth/login").send({
        email: `${role}@example.com`,
        password: "correct horse battery staple"
      });
      tokens.set(role, login.body.accessToken);
    }

    await expect(request(app).get("/admin-only").set("Authorization", `Bearer ${tokens.get("admin")}`)).resolves.toMatchObject({ status: 200 });
    await expect(request(app).get("/admin-only").set("Authorization", `Bearer ${tokens.get("agent")}`)).resolves.toMatchObject({ status: 403 });
    await expect(request(app).get("/admin-only").set("Authorization", `Bearer ${tokens.get("customer")}`)).resolves.toMatchObject({ status: 403 });
  });

  it("rejects missing, malformed and refresh tokens on access routes", async () => {
    const app = createApp();
    app.get("/admin-only", requireRole("admin"), (_request, response) => response.sendStatus(200));
    await UserModel.create({
      email: "admin@example.com",
      name: "Admin",
      passwordHash: await hashPassword("correct horse battery staple"),
      role: "admin"
    });
    const login = await request(createApp()).post("/api/v1/auth/login").send({
      email: "admin@example.com",
      password: "correct horse battery staple"
    });

    for (const token of [undefined, "not-a-jwt", login.body.refreshToken]) {
      const response = request(app).get("/admin-only");
      if (token) response.set("Authorization", `Bearer ${token}`);
      await expect(response).resolves.toMatchObject({ status: 401 });
    }
  });
});
