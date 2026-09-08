import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app.js";
import { requireRole } from "./auth.middleware.js";
import { hashPassword } from "./auth.service.js";
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

  it("rotates a refresh token and rejects replay of the consumed token", async () => {
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

    const refreshed = await request(createApp())
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: oldRefreshToken });
    const replay = await request(createApp())
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: oldRefreshToken });

    expect(refreshed.status).toBe(200);
    expect(refreshed.body.refreshToken).not.toBe(oldRefreshToken);
    expect(replay.status).toBe(401);
  });

  it("denies a customer while allowing an agent on an agent route", async () => {
    const app = createApp();
    app.get("/agent-only", requireRole("admin", "agent"), (_request, response) => {
      response.status(200).json({ allowed: true });
    });

    const customer = await UserModel.create({
      email: "customer@example.com",
      name: "Customer",
      passwordHash: await hashPassword("correct horse battery staple"),
      role: "customer"
    });
    const agent = await UserModel.create({
      email: "agent@example.com",
      name: "Agent",
      passwordHash: await hashPassword("correct horse battery staple"),
      role: "agent"
    });

    const customerLogin = await request(createApp())
      .post("/api/v1/auth/login")
      .send({ email: customer.email, password: "correct horse battery staple" });
    const agentLogin = await request(createApp())
      .post("/api/v1/auth/login")
      .send({ email: agent.email, password: "correct horse battery staple" });

    const denied = await request(app)
      .get("/agent-only")
      .set("Authorization", `Bearer ${customerLogin.body.accessToken}`);
    const allowed = await request(app)
      .get("/agent-only")
      .set("Authorization", `Bearer ${agentLogin.body.accessToken}`);

    expect(denied.status).toBe(403);
    expect(allowed.status).toBe(200);
  });
});
