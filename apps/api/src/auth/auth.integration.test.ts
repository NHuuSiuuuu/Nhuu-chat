import request from "supertest";
import { decodeJwt } from "jose";
import { createHash } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app.js";
import { requireRole } from "./auth.middleware.js";
import { hashPassword, issueTokens } from "../services/auth.service.js";
import { verifyAccessToken } from "../services/auth.service.js";
import { UserModel } from "../models/user.model.js";
import { AuthSessionModel } from "../models/auth-session.model.js";
import { startTestDatabase, stopTestDatabase } from "../test/mongo-repl-set.js";

process.env.JWT_SECRET ??= "test-jwt-secret-that-is-at-least-32-characters";

function cookieValue(setCookie: string[] | string | undefined, name: string): string {
  const cookies = typeof setCookie === "string" ? [setCookie] : setCookie;
  const value = cookies?.find((cookie) => cookie.startsWith(`${name}=`))?.split(";", 1)[0]?.slice(name.length + 1);
  if (!value) throw new Error(`Missing ${name} cookie`);
  return value;
}

describe("authentication and roles", () => {
  beforeAll(async () => {
    await startTestDatabase();
    await UserModel.syncIndexes();
    await AuthSessionModel.syncIndexes();
  }, 120_000);

  beforeEach(async () => {
    await UserModel.deleteMany({});
    await AuthSessionModel.deleteMany({});
  });

  afterAll(async () => {
    await stopTestDatabase();
  }, 30_000);

  it("registers a normalized customer and returns safe auth cookies", async () => {
    const response = await request(createApp()).post("/api/v1/auth/register").send({
      name: "New Customer",
      email: "  NEW.Customer@Example.COM ",
      password: "correct horse battery staple",
      role: "admin"
    });

    expect(response.status).toBe(201);
    expect(response.body.user).toMatchObject({ email: "new.customer@example.com", role: "customer" });
    expect(response.body.user).not.toHaveProperty("passwordHash");
    expect(response.body).not.toHaveProperty("accessToken");
    expect(response.body).not.toHaveProperty("refreshToken");
    const accessToken = cookieValue(response.headers["set-cookie"], "nhuu_access_token");
    await expect(verifyAccessToken(accessToken)).resolves.toMatchObject({
      email: "new.customer@example.com",
      role: "customer"
    });

    const document = await UserModel.findOne({ email: "new.customer@example.com" }).select(
      "+passwordHash"
    );
    expect(document).not.toBeNull();
    expect(document?.role).toBe("customer");
    expect(document?.passwordHash).not.toBe("correct horse battery staple");
    expect(await AuthSessionModel.countDocuments({ userId: document?._id })).toBe(1);
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
    expect(response.body).not.toHaveProperty("accessToken");
    expect(response.body).not.toHaveProperty("refreshToken");
  });

  it("creates independent sessions for two logins", async () => {
    const user = await UserModel.create({
      email: "admin@example.com",
      name: "Admin",
      passwordHash: await hashPassword("correct horse battery staple"),
      role: "admin"
    });

    const loginA = await request(createApp()).post("/api/v1/auth/login").send({
      email: "admin@example.com",
      password: "correct horse battery staple"
    });
    const loginB = await request(createApp()).post("/api/v1/auth/login").send({
      email: "admin@example.com",
      password: "correct horse battery staple"
    });

    expect(loginA.status).toBe(200);
    expect(loginB.status).toBe(200);
    const accessA = cookieValue(loginA.headers["set-cookie"], "nhuu_access_token");
    const refreshA = cookieValue(loginA.headers["set-cookie"], "nhuu_refresh_token");
    const accessB = cookieValue(loginB.headers["set-cookie"], "nhuu_access_token");
    const refreshB = cookieValue(loginB.headers["set-cookie"], "nhuu_refresh_token");
    const accessPayloadA = decodeJwt(accessA);
    const refreshPayloadA = decodeJwt(refreshA);
    const accessPayloadB = decodeJwt(accessB);
    const refreshPayloadB = decodeJwt(refreshB);

    expect([accessA, refreshA]).not.toEqual([accessB, refreshB]);
    expect(accessPayloadA.sessionId).toEqual(refreshPayloadA.sessionId);
    expect(accessPayloadB.sessionId).toEqual(refreshPayloadB.sessionId);
    expect(accessPayloadA.sessionId).toBeTruthy();
    expect(accessPayloadB.sessionId).toBeTruthy();
    expect(accessPayloadA.sessionId).not.toBe(accessPayloadB.sessionId);
    expect(await AuthSessionModel.countDocuments({ userId: user._id })).toBe(2);
    const sessions = await AuthSessionModel.find({ userId: user._id }).select("+refreshTokenHash");
    expect(sessions).toHaveLength(2);
    expect(sessions.map((session) => session.refreshTokenHash)).not.toContain(refreshA);
    expect(sessions.map((session) => session.refreshTokenHash)).not.toContain(refreshB);
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
    const oldRefreshToken = cookieValue(login.headers["set-cookie"], "nhuu_refresh_token");
    const sessionId = decodeJwt(oldRefreshToken).sessionId;
    const previousSession = await AuthSessionModel.findOne({ sessionId }).select("+refreshTokenHash");

    await UserModel.updateOne({ email: "agent@example.com" }, { $set: { role: "customer" } });

    const refreshed = await request(createApp())
      .post("/api/v1/auth/refresh")
      .set("Cookie", `nhuu_refresh_token=${oldRefreshToken}`);
    const replay = await request(createApp())
      .post("/api/v1/auth/refresh")
      .set("Cookie", `nhuu_refresh_token=${oldRefreshToken}`);

    expect(refreshed.status).toBe(200);
    const newRefreshToken = cookieValue(refreshed.headers["set-cookie"], "nhuu_refresh_token");
    expect(newRefreshToken).not.toBe(oldRefreshToken);
    expect(decodeJwt(newRefreshToken).sessionId).toBe(sessionId);
    expect(refreshed.body).toHaveProperty("user");
    const refreshedAccessToken = cookieValue(refreshed.headers["set-cookie"], "nhuu_access_token");
    await expect(verifyAccessToken(refreshedAccessToken)).resolves.toMatchObject({
      email: "agent@example.com",
      role: "customer"
    });
    expect(replay.status).toBe(401);
    const storedSession = await AuthSessionModel.findOne({ sessionId }).select("+refreshTokenHash");
    expect(storedSession?.refreshTokenHash).not.toBe(previousSession?.refreshTokenHash);
    expect(storedSession?.refreshTokenHash).toBe(
      createHash("sha256").update(newRefreshToken).digest("hex")
    );
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
      const tokensForUser = await issueTokens({ id: `${role}-id`, email: `${role}@example.com`, role });
      tokens.set(role, tokensForUser.accessToken);
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
    const oldRefreshToken = cookieValue(
      (await request(createApp()).post("/api/v1/auth/login").send({
        email: "admin@example.com",
        password: "correct horse battery staple"
      })).headers["set-cookie"],
      "nhuu_refresh_token"
    );

    for (const token of [undefined, "not-a-jwt", oldRefreshToken]) {
      const response = request(app).get("/admin-only");
      if (token) response.set("Authorization", `Bearer ${token}`);
      await expect(response).resolves.toMatchObject({ status: 401 });
    }
  });
});
