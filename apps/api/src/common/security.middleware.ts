import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

const buckets = new Map<string, { count: number; resetAt: number }>();

function allowedOrigins(): string[] {
  return (process.env.WEB_ALLOWED_ORIGINS ?? "http://localhost:5173")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function requestOrigin(request: Parameters<RequestHandler>[0]): string | undefined {
  const host = request.header("host");
  if (!host) return undefined;
  const forwardedProtocol = request.header("x-forwarded-proto")?.split(",")[0]?.trim();
  return `${forwardedProtocol || request.protocol}://${host}`;
}

function isAllowedOrigin(request: Parameters<RequestHandler>[0], origin: string): boolean {
  return allowedOrigins().includes(origin) || requestOrigin(request) === origin;
}

export const securityHeaders: RequestHandler = (_request, response, next) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Content-Security-Policy", "default-src 'self'");
  next();
};

export const requestId: RequestHandler = (request, response, next) => {
  const id = request.header("x-request-id") || randomUUID();
  response.setHeader("x-request-id", id);
  next();
};

export const corsAllowlist: RequestHandler = (request, response, next) => {
  const origin = request.header("origin");
  if (origin && isAllowedOrigin(request, origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Vary", "Origin");
  }
  if (request.method === "OPTIONS") {
    if (origin && !isAllowedOrigin(request, origin)) {
      response.status(403).json({ error: { code: "CSRF_ORIGIN_REJECTED", message: "Origin is not allowed" } });
      return;
    }
    response.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Request-Id");
    response.status(204).send();
    return;
  }
  next();
};

export const originProtection: RequestHandler = (request, response, next) => {
  const origin = request.header("origin");
  const mutatingMethod = ["POST", "PUT", "PATCH", "DELETE"].includes(request.method);
  if (origin && mutatingMethod && !isAllowedOrigin(request, origin)) {
    response.status(403).json({ error: { code: "CSRF_ORIGIN_REJECTED", message: "Origin is not allowed" } });
    return;
  }
  next();
};

export function rateLimit(options: { windowMs: number; max: number }): RequestHandler {
  return (request, response, next) => {
    const key = request.ip || "unknown";
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) buckets.set(key, { count: 1, resetAt: now + options.windowMs });
    else if (++bucket.count > options.max) {
      response.status(429).json({ error: { code: "RATE_LIMITED", message: "Too many requests" } });
      return;
    }
    next();
  };
}
