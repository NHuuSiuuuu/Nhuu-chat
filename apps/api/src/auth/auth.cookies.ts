import type { Request, Response } from "express";

import type { TokenPair } from "../services/auth.service.js";

export const ACCESS_COOKIE_NAME = "nhuu_access_token";
export const REFRESH_COOKIE_NAME = "nhuu_refresh_token";

const ACCESS_MAX_AGE_SECONDS = 15 * 60;
const REFRESH_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

function sameSite(): "Lax" | "Strict" | "None" {
  const configured = process.env.AUTH_COOKIE_SAME_SITE?.toLowerCase();
  if (configured === "strict") return "Strict";
  if (configured === "none") return "None";
  return process.env.NODE_ENV === "production" ? "None" : "Lax";
}

function cookieOptions(maxAge: number, value: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${value}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=${sameSite()}${secure}`;
}

export function readCookie(request: Request, name: string): string | undefined {
  return readCookieHeader(request.header("cookie"), name);
}

export function readCookieHeader(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;

  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    if (key !== name) continue;
    const value = part.slice(separator + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  return undefined;
}

export function setAuthCookies(response: Response, tokens: TokenPair): void {
  response.setHeader("Set-Cookie", [
    cookieOptions(ACCESS_MAX_AGE_SECONDS, `${ACCESS_COOKIE_NAME}=${encodeURIComponent(tokens.accessToken)}`),
    cookieOptions(REFRESH_MAX_AGE_SECONDS, `${REFRESH_COOKIE_NAME}=${encodeURIComponent(tokens.refreshToken)}`)
  ]);
}

export function clearAuthCookies(response: Response): void {
  response.setHeader("Set-Cookie", [
    cookieOptions(0, `${ACCESS_COOKIE_NAME}=`),
    cookieOptions(0, `${REFRESH_COOKIE_NAME}=`)
  ]);
}
