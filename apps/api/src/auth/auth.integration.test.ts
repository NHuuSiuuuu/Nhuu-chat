import request from "supertest";
import { decodeJwt, SignJWT } from "jose";
import { createHash } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../app.js";
import { requireRole } from "./auth.middleware.js";
import { hashPassword, issueTokens, rotateRefreshToken } from "../services/auth.service.js";
import { verifyAccessToken } from "../services/auth.service.js";
import { UserModel } from "../models/user.model.js";
import { AuthSessionModel } from "../models/auth-session.model.js";
import { PasswordResetTokenModel } from "../models/password-reset-token.model.js";
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
    await PasswordResetTokenModel.syncIndexes();
  }, 120_000);

  beforeEach(async () => {
    await UserModel.deleteMany({});
    await AuthSessionModel.deleteMany({});
    await PasswordResetTokenModel.deleteMany({});
  });

  afterEach(() => vi.restoreAllMocks());

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

  it("logs out one session without revoking another", async () => {
    const user = await UserModel.create({
      email: "logout@example.com",
      name: "Logout User",
      passwordHash: await hashPassword("correct horse battery staple"),
      role: "admin"
    });
    const app = createApp();
    app.get("/admin-only", requireRole("admin"), (_request, response) => response.sendStatus(200));
    const credentials = { email: user.email, password: "correct horse battery staple" };
    const loginA = await request(app).post("/api/v1/auth/login").send(credentials);
    const loginB = await request(app).post("/api/v1/auth/login").send(credentials);
    const accessA = cookieValue(loginA.headers["set-cookie"], "nhuu_access_token");
    const refreshA = cookieValue(loginA.headers["set-cookie"], "nhuu_refresh_token");
    const accessB = cookieValue(loginB.headers["set-cookie"], "nhuu_access_token");
    const refreshB = cookieValue(loginB.headers["set-cookie"], "nhuu_refresh_token");
    const sessionA = decodeJwt(refreshA).sessionId;
    const sessionB = decodeJwt(refreshB).sessionId;

    const logout = await request(app).post("/api/v1/auth/logout")
      .set("Cookie", `nhuu_refresh_token=${refreshA}`);

    expect(logout.status).toBe(204);
    expect(logout.headers["set-cookie"]).toEqual([
      expect.stringContaining("nhuu_access_token=;"),
      expect.stringContaining("nhuu_refresh_token=;")
    ]);
    expect(await AuthSessionModel.exists({ sessionId: sessionA })).toBeNull();
    expect(await AuthSessionModel.exists({ sessionId: sessionB })).not.toBeNull();
    expect((await request(app).get("/admin-only").set("Cookie", `nhuu_access_token=${accessA}`)).status).toBe(401);
    expect((await request(app).get("/admin-only").set("Cookie", `nhuu_access_token=${accessB}`)).status).toBe(200);
    const refreshedB = await request(app).post("/api/v1/auth/refresh")
      .set("Cookie", `nhuu_refresh_token=${refreshB}`);
    expect(refreshedB.status).toBe(200);
    expect(decodeJwt(cookieValue(refreshedB.headers["set-cookie"], "nhuu_refresh_token")).sessionId).toBe(sessionB);
  });

  it("resets a password and revokes every session and legacy refresh hash", async () => {
    const user = await UserModel.create({
      email: "reset@example.com",
      name: "Reset User",
      passwordHash: await hashPassword("correct horse battery staple"),
      role: "admin"
    });
    const app = createApp();
    app.get("/admin-only", requireRole("admin"), (_request, response) => response.sendStatus(200));
    const credentials = { email: user.email, password: "correct horse battery staple" };
    const loginA = await request(app).post("/api/v1/auth/login").send(credentials);
    const loginB = await request(app).post("/api/v1/auth/login").send(credentials);
    const accessA = cookieValue(loginA.headers["set-cookie"], "nhuu_access_token");
    const accessB = cookieValue(loginB.headers["set-cookie"], "nhuu_access_token");
    expect(await AuthSessionModel.countDocuments({ userId: user._id })).toBe(2);

    const legacy = await issueTokens({ id: user.id, email: user.email, role: user.role });
    await UserModel.updateOne({ _id: user._id }, {
      $set: { refreshTokenHash: createHash("sha256").update(legacy.refreshToken).digest("hex") }
    });
    const rawResetToken = "reset-token-for-all-sessions";
    await PasswordResetTokenModel.create({
      userId: user._id,
      tokenHash: createHash("sha256").update(rawResetToken).digest("hex"),
      expiresAt: new Date(Date.now() + 60_000)
    });

    const reset = await request(app).post("/api/v1/auth/reset-password").send({
      token: rawResetToken,
      password: "replacement-password-123"
    });

    expect(reset.status).toBe(204);
    expect(await AuthSessionModel.countDocuments({ userId: user._id })).toBe(0);
    expect((await UserModel.findById(user._id).select("+refreshTokenHash"))?.refreshTokenHash).toBeNull();
    expect(await PasswordResetTokenModel.countDocuments({ userId: user._id })).toBe(0);
    for (const accessToken of [accessA, accessB]) {
      expect((await request(app).get("/admin-only").set("Cookie", `nhuu_access_token=${accessToken}`)).status).toBe(401);
    }
    expect((await request(app).post("/api/v1/auth/refresh")
      .set("Cookie", `nhuu_refresh_token=${legacy.refreshToken}`)).status).toBe(401);
  });

  it("serializes a password reset against a login inserting a session", async () => {
    const user = await UserModel.create({
      email: "reset-race@example.com",
      name: "Reset Race User",
      passwordHash: await hashPassword("old-password-123"),
      role: "admin"
    });
    const rawResetToken = "reset-token-during-login";
    await PasswordResetTokenModel.create({
      userId: user._id,
      tokenHash: createHash("sha256").update(rawResetToken).digest("hex"),
      expiresAt: new Date(Date.now() + 60_000)
    });
    let markCreateStarted!: () => void;
    const createStarted = new Promise<void>((resolve) => { markCreateStarted = resolve; });
    let releaseCreate!: () => void;
    const holdCreate = new Promise<void>((resolve) => { releaseCreate = resolve; });
    const realCreate = AuthSessionModel.create.bind(AuthSessionModel);
    vi.spyOn(AuthSessionModel, "create").mockImplementationOnce((async (...args: Parameters<typeof AuthSessionModel.create>) => {
      markCreateStarted();
      await holdCreate;
      return realCreate(...args);
    }) as typeof AuthSessionModel.create);
    const consumeSpy = vi.spyOn(PasswordResetTokenModel, "findOneAndDelete");
    const app = createApp();
    app.get("/admin-only", requireRole("admin"), (_request, response) => response.sendStatus(200));
    const login = request(app).post("/api/v1/auth/login").send({
      email: user.email, password: "old-password-123"
    }).then((response) => response);
    let reset!: Promise<{ status: number }>;
    let resetWhilePaused: "settled" | "waiting" = "waiting";

    try {
      await createStarted;
      reset = request(app).post("/api/v1/auth/reset-password").send({
        token: rawResetToken, password: "new-password-123"
      }).then((response) => response);
      await vi.waitFor(() => expect(consumeSpy).toHaveBeenCalled(), { timeout: 10_000 });
      resetWhilePaused = await Promise.race([
        reset.then(() => "settled" as const),
        new Promise<"waiting">((resolve) => setTimeout(() => resolve("waiting"), 750))
      ]);
    } finally {
      releaseCreate();
    }

    const [loginResponse, resetResponse] = await Promise.all([login, reset]);
    expect(resetWhilePaused).toBe("waiting");
    expect(loginResponse.status).toBe(200);
    expect(resetResponse.status).toBe(204);
    expect(await AuthSessionModel.countDocuments({ userId: user._id })).toBe(0);
    const access = cookieValue(loginResponse.headers["set-cookie"], "nhuu_access_token");
    expect((await request(app).get("/admin-only").set("Cookie", `nhuu_access_token=${access}`)).status).toBe(401);
  });

  it("logs out a legacy refresh token without revoking newer sessions", async () => {
    const user = await UserModel.create({
      email: "legacy-logout@example.com",
      name: "Legacy Logout User",
      passwordHash: await hashPassword("correct horse battery staple"),
      role: "admin"
    });
    const legacy = await issueTokens({ id: user.id, email: user.email, role: user.role });
    await UserModel.updateOne({ _id: user._id }, {
      $set: { refreshTokenHash: createHash("sha256").update(legacy.refreshToken).digest("hex") }
    });
    const app = createApp();
    app.get("/admin-only", requireRole("admin"), (_request, response) => response.sendStatus(200));
    const login = await request(app).post("/api/v1/auth/login").send({
      email: user.email, password: "correct horse battery staple"
    });
    const access = cookieValue(login.headers["set-cookie"], "nhuu_access_token");
    const refresh = cookieValue(login.headers["set-cookie"], "nhuu_refresh_token");

    const logout = await request(app).post("/api/v1/auth/logout")
      .set("Cookie", `nhuu_refresh_token=${legacy.refreshToken}`);

    expect(logout.status).toBe(204);
    expect(logout.headers["set-cookie"]).toEqual([
      expect.stringContaining("nhuu_access_token=;"),
      expect.stringContaining("nhuu_refresh_token=;")
    ]);
    expect((await UserModel.findById(user._id).select("+refreshTokenHash"))?.refreshTokenHash).toBeNull();
    expect(await AuthSessionModel.countDocuments({ userId: user._id })).toBe(1);
    expect((await request(app).get("/admin-only").set("Cookie", `nhuu_access_token=${access}`)).status).toBe(200);
    expect((await request(app).post("/api/v1/auth/refresh")
      .set("Cookie", `nhuu_refresh_token=${refresh}`)).status).toBe(200);
  });

  it("does not revoke a session when logout uses an already rotated refresh token", async () => {
    const user = await UserModel.create({
      email: "stale-logout@example.com",
      name: "Stale Logout User",
      passwordHash: await hashPassword("correct horse battery staple"),
      role: "admin"
    });
    const app = createApp();
    const login = await request(app).post("/api/v1/auth/login").send({
      email: user.email, password: "correct horse battery staple"
    });
    const staleRefresh = cookieValue(login.headers["set-cookie"], "nhuu_refresh_token");
    const refreshed = await request(app).post("/api/v1/auth/refresh")
      .set("Cookie", `nhuu_refresh_token=${staleRefresh}`);
    const currentRefresh = cookieValue(refreshed.headers["set-cookie"], "nhuu_refresh_token");
    const logout = await request(app).post("/api/v1/auth/logout")
      .set("Cookie", `nhuu_refresh_token=${staleRefresh}`);

    expect(logout.status).toBe(204);
    expect(await AuthSessionModel.countDocuments({ userId: user._id })).toBe(1);
    expect((await request(app).post("/api/v1/auth/refresh")
      .set("Cookie", `nhuu_refresh_token=${currentRefresh}`)).status).toBe(200);
  });

  it("rejects access tokens from revoked sessions while accepting a valid legacy bearer", async () => {
    const user = await UserModel.create({
      email: "revoke@example.com",
      name: "Revoked User",
      passwordHash: await hashPassword("correct horse battery staple"),
      role: "admin"
    });
    const app = createApp();
    app.get("/admin-only", requireRole("admin"), (_request, response) => response.sendStatus(200));
    const login = await request(app).post("/api/v1/auth/login").send({
      email: user.email,
      password: "correct horse battery staple"
    });
    const accessToken = cookieValue(login.headers["set-cookie"], "nhuu_access_token");
    const sessionId = decodeJwt(accessToken).sessionId;

    expect((await request(app).get("/admin-only").set("Cookie", `nhuu_access_token=${accessToken}`)).status).toBe(200);
    await AuthSessionModel.deleteOne({ sessionId });
    expect((await request(app).get("/admin-only").set("Cookie", `nhuu_access_token=${accessToken}`)).status).toBe(401);

    const legacy = await issueTokens({ id: user.id, email: user.email, role: user.role });
    expect((await request(app).get("/admin-only").set("Authorization", `Bearer ${legacy.accessToken}`)).status).toBe(200);
  });

  it("rejects session access tokens when the session has expired", async () => {
    const user = await UserModel.create({
      email: "expired@example.com",
      name: "Expired User",
      passwordHash: await hashPassword("correct horse battery staple"),
      role: "admin"
    });
    const app = createApp();
    app.get("/admin-only", requireRole("admin"), (_request, response) => response.sendStatus(200));
    const login = await request(app).post("/api/v1/auth/login").send({
      email: user.email,
      password: "correct horse battery staple"
    });
    const accessToken = cookieValue(login.headers["set-cookie"], "nhuu_access_token");
    await AuthSessionModel.updateOne(
      { sessionId: decodeJwt(accessToken).sessionId },
      { $set: { expiresAt: new Date(Date.now() - 1_000) } }
    );

    expect((await request(app).get("/admin-only").set("Cookie", `nhuu_access_token=${accessToken}`)).status).toBe(401);
  });

  it("rejects malformed session claims instead of treating them as legacy", async () => {
    const app = createApp();
    app.get("/admin-only", requireRole("admin"), (_request, response) => response.sendStatus(200));
    for (const sessionId of [null, 42, "", " "]) {
      const token = await new SignJWT({
        email: "admin@example.com", role: "admin", tokenUse: "access", sessionId
      })
        .setProtectedHeader({ alg: "HS256" })
        .setSubject("legacy-id")
        .setIssuedAt()
        .setExpirationTime("15m")
        .sign(new TextEncoder().encode(process.env.JWT_SECRET));
      expect((await request(app).get("/admin-only").set("Authorization", `Bearer ${token}`)).status).toBe(401);
    }
  });

  it("rejects legacy access tokens older than fifteen minutes even with a future expiry", async () => {
    const issuedAt = Math.floor(Date.now() / 1000) - 16 * 60;
    const token = await new SignJWT({ email: "admin@example.com", role: "admin", tokenUse: "access" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("legacy-id")
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + 60 * 60)
      .sign(new TextEncoder().encode(process.env.JWT_SECRET));
    const app = createApp();
    app.get("/admin-only", requireRole("admin"), (_request, response) => response.sendStatus(200));

    expect((await request(app).get("/admin-only").set("Authorization", `Bearer ${token}`)).status).toBe(401);
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

  it("accepts exactly one concurrent refresh for a session and stores the winner digest", async () => {
    const user = await UserModel.create({
      email: "session-race@example.com",
      name: "Session Race User",
      passwordHash: await hashPassword("correct horse battery staple"),
      role: "customer"
    });
    const app = createApp();
    const login = await request(app).post("/api/v1/auth/login").send({
      email: user.email, password: "correct horse battery staple"
    });
    const oldRefresh = cookieValue(login.headers["set-cookie"], "nhuu_refresh_token");
    const sessionId = decodeJwt(oldRefresh).sessionId;
    let releaseUpdates!: () => void;
    const holdUpdates = new Promise<void>((resolve) => { releaseUpdates = resolve; });
    const realUpdate = AuthSessionModel.updateOne.bind(AuthSessionModel);
    const updateSpy = vi.spyOn(AuthSessionModel, "updateOne").mockImplementation((async (
      ...args: Parameters<typeof AuthSessionModel.updateOne>
    ) => {
      await holdUpdates;
      return realUpdate(...args);
    }) as typeof AuthSessionModel.updateOne);
    const refreshA = request(app).post("/api/v1/auth/refresh")
      .set("Cookie", `nhuu_refresh_token=${oldRefresh}`).then((response) => response);
    const refreshB = request(app).post("/api/v1/auth/refresh")
      .set("Cookie", `nhuu_refresh_token=${oldRefresh}`).then((response) => response);

    try {
      await vi.waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(2), { timeout: 10_000 });
    } finally {
      releaseUpdates();
      await Promise.allSettled([refreshA, refreshB]);
    }
    const responses = await Promise.all([refreshA, refreshB]);
    const winners = responses.filter((response) => response.status === 200);
    const losers = responses.filter((response) => response.status === 401);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect(losers[0]?.body.error.code).toBe("INVALID_REFRESH_TOKEN");
    const winner = winners[0];
    if (!winner) throw new Error("Expected one successful refresh");
    const newRefresh = cookieValue(winner.headers["set-cookie"], "nhuu_refresh_token");
    expect(decodeJwt(newRefresh).sessionId).toBe(sessionId);
    const stored = await AuthSessionModel.findOne({ sessionId }).select("+refreshTokenHash");
    expect(stored?.refreshTokenHash).toBe(createHash("sha256").update(newRefresh).digest("hex"));
  });

  it("refreshes two live sessions independently when one token is replayed", async () => {
    const user = await UserModel.create({
      email: "two-live-sessions@example.com",
      name: "Two Session User",
      passwordHash: await hashPassword("correct horse battery staple"),
      role: "customer"
    });
    const app = createApp();
    const credentials = { email: user.email, password: "correct horse battery staple" };
    const loginA = await request(app).post("/api/v1/auth/login").send(credentials);
    const loginB = await request(app).post("/api/v1/auth/login").send(credentials);
    const oldA = cookieValue(loginA.headers["set-cookie"], "nhuu_refresh_token");
    const oldB = cookieValue(loginB.headers["set-cookie"], "nhuu_refresh_token");
    const sidA = decodeJwt(oldA).sessionId;
    const sidB = decodeJwt(oldB).sessionId;
    expect(sidA).not.toBe(sidB);
    const storedB = await AuthSessionModel.findOne({ sessionId: sidB }).select("+refreshTokenHash");

    const refreshedA = await request(app).post("/api/v1/auth/refresh")
      .set("Cookie", `nhuu_refresh_token=${oldA}`);
    const replayA = await request(app).post("/api/v1/auth/refresh")
      .set("Cookie", `nhuu_refresh_token=${oldA}`);
    const refreshedB = await request(app).post("/api/v1/auth/refresh")
      .set("Cookie", `nhuu_refresh_token=${oldB}`);

    expect(refreshedA.status).toBe(200);
    expect(replayA.status).toBe(401);
    expect(replayA.body.error.code).toBe("INVALID_REFRESH_TOKEN");
    expect(refreshedB.status).toBe(200);
    const nextA = cookieValue(refreshedA.headers["set-cookie"], "nhuu_refresh_token");
    const nextB = cookieValue(refreshedB.headers["set-cookie"], "nhuu_refresh_token");
    expect(decodeJwt(nextA).sessionId).toBe(sidA);
    expect(decodeJwt(nextB).sessionId).toBe(sidB);
    expect(storedB?.refreshTokenHash).toBe(createHash("sha256").update(oldB).digest("hex"));
    expect((await AuthSessionModel.findOne({ sessionId: sidB }).select("+refreshTokenHash"))?.refreshTokenHash)
      .toBe(createHash("sha256").update(nextB).digest("hex"));
    expect((await request(app).post("/api/v1/auth/refresh")
      .set("Cookie", `nhuu_refresh_token=${nextA}`)).status).toBe(200);
    expect(await AuthSessionModel.countDocuments({ userId: user._id })).toBe(2);
  });

  it("upgrades a valid legacy refresh token into one session and rejects replay", async () => {
    const document = await UserModel.create({
      email: "legacy@example.com",
      name: "Legacy User",
      passwordHash: await hashPassword("correct horse battery staple"),
      role: "customer"
    });
    const legacyTokens = await issueTokens({
      id: document.id,
      email: document.email,
      role: document.role
    });
    expect(decodeJwt(legacyTokens.refreshToken).sessionId).toBeUndefined();
    await UserModel.updateOne(
      { _id: document._id },
      { $set: { refreshTokenHash: createHash("sha256").update(legacyTokens.refreshToken).digest("hex") } }
    );

    const refreshed = await request(createApp())
      .post("/api/v1/auth/refresh")
      .set("Cookie", `nhuu_refresh_token=${legacyTokens.refreshToken}`);

    expect(refreshed.status).toBe(200);
    const newRefreshToken = cookieValue(refreshed.headers["set-cookie"], "nhuu_refresh_token");
    const sessionId = decodeJwt(newRefreshToken).sessionId;
    expect(sessionId).toEqual(expect.any(String));
    const storedSession = await AuthSessionModel.findOne({ userId: document._id }).select(
      "+refreshTokenHash"
    );
    expect(storedSession?.sessionId).toBe(sessionId);
    expect(storedSession?.refreshTokenHash).toBe(
      createHash("sha256").update(newRefreshToken).digest("hex")
    );
    expect(await AuthSessionModel.countDocuments({ userId: document._id })).toBe(1);
    const upgradedUser = await UserModel.findById(document._id).select("+refreshTokenHash");
    expect(upgradedUser?.refreshTokenHash).toBeNull();

    const replay = await request(createApp())
      .post("/api/v1/auth/refresh")
      .set("Cookie", `nhuu_refresh_token=${legacyTokens.refreshToken}`);
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe("INVALID_REFRESH_TOKEN");
    expect(await AuthSessionModel.countDocuments({ userId: document._id })).toBe(1);
  });

  it("allows exactly one concurrent upgrade of a legacy refresh token", async () => {
    const document = await UserModel.create({
      email: "legacy-race@example.com",
      name: "Legacy User",
      passwordHash: await hashPassword("correct horse battery staple"),
      role: "customer"
    });
    const legacyTokens = await issueTokens({
      id: document.id,
      email: document.email,
      role: document.role
    });
    await UserModel.updateOne(
      { _id: document._id },
      { $set: { refreshTokenHash: createHash("sha256").update(legacyTokens.refreshToken).digest("hex") } }
    );

    const results = await Promise.allSettled([
      rotateRefreshToken(legacyTokens.refreshToken),
      rotateRefreshToken(legacyTokens.refreshToken)
    ]);
    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const loser = rejected[0];
    if (loser?.status !== "rejected") throw new Error("Expected one rejected refresh");
    expect(loser.reason).toMatchObject({ statusCode: 401, code: "INVALID_REFRESH_TOKEN" });
    const winner = fulfilled[0];
    if (winner?.status !== "fulfilled") throw new Error("Expected one successful refresh");
    expect(decodeJwt(winner.value.tokens.refreshToken).sessionId).toEqual(expect.any(String));
    const sessions = await AuthSessionModel.find({ userId: document._id }).select("+refreshTokenHash");
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.refreshTokenHash).toBe(
      createHash("sha256").update(winner.value.tokens.refreshToken).digest("hex")
    );
    await expect(rotateRefreshToken(legacyTokens.refreshToken)).rejects.toMatchObject({
      statusCode: 401,
      code: "INVALID_REFRESH_TOKEN"
    });
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
