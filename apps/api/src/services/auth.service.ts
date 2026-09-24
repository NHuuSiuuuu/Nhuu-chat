import { createHash, randomUUID } from "node:crypto";

import bcrypt from "bcryptjs";
import { jwtVerify, SignJWT } from "jose";
import mongoose from "mongoose";

import { AppError } from "../common/errors.js";
import { AuthSessionModel } from "../models/auth-session.model.js";
import { UserModel, type Role } from "../models/user.model.js";
import { recordSettingHistorySafely } from "./setting-history.service.js";
import { workspaceService } from "./workspace.service.js";

const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL = "7d";
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
}

export interface AuthPrincipal extends AuthUser {
  sessionId?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

interface VerifiedToken extends AuthUser {
  tokenUse: "access" | "refresh";
  sessionId?: string;
}

function jwtKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must contain at least 32 characters");
  }

  return new TextEncoder().encode(secret);
}

function refreshDigest(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function signToken(
  user: AuthUser,
  tokenUse: "access" | "refresh",
  sessionId?: string
): Promise<string> {
  const claims: Record<string, string> = { email: user.email, role: user.role, tokenUse };
  if (sessionId) claims.sessionId = sessionId;

  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(tokenUse === "access" ? ACCESS_TOKEN_TTL : REFRESH_TOKEN_TTL)
    .sign(jwtKey());
}

async function verifyToken(token: string, expectedUse: "access" | "refresh"): Promise<VerifiedToken> {
  try {
    const { payload } = await jwtVerify(token, jwtKey(), {
      algorithms: ["HS256"],
      ...(expectedUse === "access" ? { maxTokenAge: ACCESS_TOKEN_TTL } : {})
    });
    if (
      !payload.sub ||
      typeof payload.email !== "string" ||
      !["admin", "agent", "customer"].includes(String(payload.role)) ||
      payload.tokenUse !== expectedUse ||
      ("sessionId" in payload && (typeof payload.sessionId !== "string" || !payload.sessionId.trim()))
    ) {
      throw new Error("Invalid token claims");
    }

    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role as Role,
      tokenUse: expectedUse,
      ...(typeof payload.sessionId === "string" ? { sessionId: payload.sessionId } : {})
    };
  } catch {
    throw new AppError(401, "INVALID_TOKEN", "Token is invalid or expired");
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function issueTokens(user: AuthUser): Promise<TokenPair> {
  const [accessToken, refreshToken] = await Promise.all([
    signToken(user, "access"),
    signToken(user, "refresh")
  ]);

  return { accessToken, refreshToken };
}

async function issueSessionTokens(user: AuthUser, sessionId: string): Promise<TokenPair> {
  const [accessToken, refreshToken] = await Promise.all([
    signToken(user, "access", sessionId),
    signToken(user, "refresh", sessionId)
  ]);

  return { accessToken, refreshToken };
}

// Ghi vào user và phiên trong cùng transaction để đồng bộ với thao tác đặt lại mật khẩu.
async function createAuthSession(
  user: AuthUser,
  expectedPasswordHash: string
): Promise<{ tokens: TokenPair; sessionId: string }> {
  const sessionId = randomUUID();
  const tokens = await issueSessionTokens(user, sessionId);
  const now = new Date();
  await ensureAuthSessionsCollection();
  const mongoSession = await mongoose.startSession();
  try {
    await mongoSession.withTransaction(async () => {
      const result = await UserModel.updateOne(
        { _id: user.id, passwordHash: expectedPasswordHash },
        { $inc: { authSessionRevision: 1 } },
        { session: mongoSession }
      );
      if (result.matchedCount !== 1) {
        throw new AppError(401, "INVALID_CREDENTIALS", "Email or password is incorrect");
      }

      await AuthSessionModel.create([{
        sessionId,
        userId: user.id,
        refreshTokenHash: refreshDigest(tokens.refreshToken),
        lastUsedAt: now,
        expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS)
      }], { session: mongoSession });
    });
  } finally {
    await mongoSession.endSession();
  }

  return { tokens, sessionId };
}

// Tạo collection trước transaction để các lượt nâng cấp legacy đầu tiên không tranh chấp tạo collection.
async function ensureAuthSessionsCollection(): Promise<void> {
  try {
    await AuthSessionModel.createCollection();
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === 48) {
      return;
    }
    throw error;
  }
}

export async function isAuthSessionActive(userId: string, sessionId: string): Promise<boolean> {
  return Boolean(await AuthSessionModel.exists({
    sessionId,
    userId,
    expiresAt: { $gt: new Date() }
  }));
}

export async function verifyAccessToken(token: string): Promise<AuthPrincipal> {
  const { tokenUse: _tokenUse, ...user } = await verifyToken(token, "access");
  if (user.sessionId && !(await isAuthSessionActive(user.id, user.sessionId))) {
    throw new AppError(401, "INVALID_TOKEN", "Token is invalid or expired");
  }
  return user;
}

export async function register(
  name: string,
  email: string,
  password: string
): Promise<{ user: AuthUser; tokens: TokenPair }> {
  const document = await UserModel.create({
    name: name.trim(),
    email: email.trim().toLowerCase(),
    passwordHash: await hashPassword(password),
    role: "customer"
  });
  await workspaceService.ensurePersonalWorkspace(document.id, name.trim());

  const user: AuthUser = {
    id: document.id,
    email: document.email,
    role: document.role
  };
  const { tokens } = await createAuthSession(user, document.passwordHash);

  return { user, tokens };
}

export async function login(email: string, password: string): Promise<{
  user: AuthUser;
  tokens: TokenPair;
}> {
  const document = await UserModel.findOne({ email: email.trim().toLowerCase() }).select(
    "+passwordHash"
  );
  if (!document || !(await verifyPassword(document.passwordHash, password))) {
    throw new AppError(401, "INVALID_CREDENTIALS", "Email or password is incorrect");
  }

  const user: AuthUser = {
    id: document.id,
    email: document.email,
    role: document.role
  };
  const { tokens } = await createAuthSession(user, document.passwordHash);

  recordSettingHistorySafely({
    userId: user.id,
    actionType: "LOGIN",
    actionTitle: "Đăng nhập tài khoản",
    oldValue: { session: "Đã kết thúc" },
    newValue: { session: "Đang hoạt động" }
  });

  return { user, tokens };
}

export async function rotateRefreshToken(refreshToken: string): Promise<{ user: AuthUser; tokens: TokenPair }> {
  const tokenUser = await verifyToken(refreshToken, "refresh");
  const currentDigest = refreshDigest(refreshToken);

  // Refresh token mới chỉ được xoay khi digest khớp phiên và cập nhật CAS thành công.
  if (tokenUser.sessionId) {
    const now = new Date();
    const authSession = await AuthSessionModel.findOne({
      sessionId: tokenUser.sessionId,
      userId: tokenUser.id,
      expiresAt: { $gt: now }
    }).select("+refreshTokenHash");
    if (!authSession || authSession.refreshTokenHash !== currentDigest) {
      throw new AppError(401, "INVALID_REFRESH_TOKEN", "Refresh token is invalid or revoked");
    }

    const document = await UserModel.findById(tokenUser.id);
    if (!document) {
      throw new AppError(401, "INVALID_REFRESH_TOKEN", "Refresh token is invalid or revoked");
    }
    const currentUser: AuthUser = {
      id: document.id,
      email: document.email,
      role: document.role
    };
    const tokens = await issueSessionTokens(currentUser, tokenUser.sessionId);
    const result = await AuthSessionModel.updateOne(
      {
        sessionId: tokenUser.sessionId,
        userId: tokenUser.id,
        refreshTokenHash: currentDigest,
        expiresAt: { $gt: now }
      },
      {
        $set: {
          refreshTokenHash: refreshDigest(tokens.refreshToken),
          lastUsedAt: now,
          expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS)
        }
      }
    );

    if (result.modifiedCount !== 1) {
      throw new AppError(401, "INVALID_REFRESH_TOKEN", "Refresh token is invalid or revoked");
    }

    return { user: currentUser, tokens };
  }

  await ensureAuthSessionsCollection();
  const mongoSession = await mongoose.startSession();
  try {
    let upgraded: { user: AuthUser; tokens: TokenPair } | undefined;
    await mongoSession.withTransaction(async () => {
      const legacyUser = await UserModel.findOne({
        _id: tokenUser.id,
        refreshTokenHash: currentDigest
      }).select("+refreshTokenHash").session(mongoSession);
      if (!legacyUser) {
        throw new AppError(401, "INVALID_REFRESH_TOKEN", "Refresh token is invalid or revoked");
      }

      const user: AuthUser = {
        id: legacyUser.id,
        email: legacyUser.email,
        role: legacyUser.role
      };
      const sessionId = randomUUID();
      const tokens = await issueSessionTokens(user, sessionId);
      const now = new Date();
      const result = await UserModel.updateOne(
        { _id: legacyUser._id, refreshTokenHash: currentDigest },
        { $set: { refreshTokenHash: null } },
        { session: mongoSession }
      );
      if (result.modifiedCount !== 1) {
        throw new AppError(401, "INVALID_REFRESH_TOKEN", "Refresh token is invalid or revoked");
      }

      await AuthSessionModel.create([{
        sessionId,
        userId: legacyUser._id,
        refreshTokenHash: refreshDigest(tokens.refreshToken),
        lastUsedAt: now,
        expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS)
      }], { session: mongoSession });
      upgraded = { user, tokens };
    });

    if (!upgraded) throw new Error("Legacy refresh transaction did not complete");
    return upgraded;
  } finally {
    await mongoSession.endSession();
  }
}

// Thu hồi đúng phiên sở hữu refresh token hiện tại; token cũ không được xóa phiên đã xoay.
export async function revokeRefreshToken(refreshToken: string): Promise<string | undefined> {
  let tokenUser: VerifiedToken;
  try {
    tokenUser = await verifyToken(refreshToken, "refresh");
  } catch {
    // Cookie sai hoặc hết hạn vẫn được controller xóa khi logout.
    return undefined;
  }

  const currentDigest = refreshDigest(refreshToken);
  if (tokenUser.sessionId) {
    const now = new Date();
    const authSession = await AuthSessionModel.findOne({
      sessionId: tokenUser.sessionId,
      userId: tokenUser.id,
      expiresAt: { $gt: now }
    }).select("+refreshTokenHash");
    if (!authSession || authSession.refreshTokenHash !== currentDigest) return undefined;

    const result = await AuthSessionModel.deleteOne({
      sessionId: tokenUser.sessionId,
      userId: tokenUser.id,
      refreshTokenHash: currentDigest,
      expiresAt: { $gt: now }
    });
    if (result.deletedCount !== 1) return undefined;
    recordLogoutHistory(tokenUser.id);
    return tokenUser.sessionId;
  }

  const result = await UserModel.updateOne(
    { _id: tokenUser.id, refreshTokenHash: currentDigest },
    { $set: { refreshTokenHash: null } }
  );
  if (result.matchedCount === 1) recordLogoutHistory(tokenUser.id);
  return undefined;
}

function recordLogoutHistory(userId: string): void {
  recordSettingHistorySafely({
    userId,
    actionType: "LOGOUT",
    actionTitle: "Đăng xuất tài khoản",
    oldValue: { session: "Đang hoạt động" },
    newValue: { session: "Đã kết thúc" }
  });
}
