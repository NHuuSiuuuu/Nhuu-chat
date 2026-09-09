import { createHash, randomUUID } from "node:crypto";

import bcrypt from "bcryptjs";
import { jwtVerify, SignJWT } from "jose";

import { AppError } from "../common/errors.js";
import { UserModel, type Role } from "../models/user.model.js";

const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL = "7d";

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

interface VerifiedToken extends AuthUser {
  tokenUse: "access" | "refresh";
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

async function signToken(user: AuthUser, tokenUse: "access" | "refresh"): Promise<string> {
  return new SignJWT({ email: user.email, role: user.role, tokenUse })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(tokenUse === "access" ? ACCESS_TOKEN_TTL : REFRESH_TOKEN_TTL)
    .sign(jwtKey());
}

async function verifyToken(token: string, expectedUse: "access" | "refresh"): Promise<VerifiedToken> {
  try {
    const { payload } = await jwtVerify(token, jwtKey(), { algorithms: ["HS256"] });
    if (
      !payload.sub ||
      typeof payload.email !== "string" ||
      !["admin", "agent", "customer"].includes(String(payload.role)) ||
      payload.tokenUse !== expectedUse
    ) {
      throw new Error("Invalid token claims");
    }

    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role as Role,
      tokenUse: expectedUse
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

export async function verifyAccessToken(token: string): Promise<AuthUser> {
  const { tokenUse: _tokenUse, ...user } = await verifyToken(token, "access");
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

  const user: AuthUser = {
    id: document.id,
    email: document.email,
    role: document.role
  };
  const tokens = await issueTokens(user);
  await UserModel.updateOne(
    { _id: document._id },
    { $set: { refreshTokenHash: refreshDigest(tokens.refreshToken) } }
  );

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
  const tokens = await issueTokens(user);
  await UserModel.updateOne(
    { _id: document._id },
    { $set: { refreshTokenHash: refreshDigest(tokens.refreshToken) } }
  );

  return { user, tokens };
}

export async function rotateRefreshToken(refreshToken: string): Promise<TokenPair> {
  const tokenUser = await verifyToken(refreshToken, "refresh");
  const currentDigest = refreshDigest(refreshToken);
  const document = await UserModel.findById(tokenUser.id).select("+refreshTokenHash");
  if (!document || document.refreshTokenHash !== currentDigest) {
    throw new AppError(401, "INVALID_REFRESH_TOKEN", "Refresh token is invalid or revoked");
  }

  const currentUser: AuthUser = {
    id: document.id,
    email: document.email,
    role: document.role
  };
  const tokens = await issueTokens(currentUser);
  const result = await UserModel.updateOne(
    { _id: document._id, refreshTokenHash: currentDigest },
    { $set: { refreshTokenHash: refreshDigest(tokens.refreshToken) } }
  );

  if (result.modifiedCount !== 1) {
    throw new AppError(401, "INVALID_REFRESH_TOKEN", "Refresh token is invalid or revoked");
  }

  return tokens;
}
