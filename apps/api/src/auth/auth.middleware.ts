import type { Request, RequestHandler } from "express";

import { AppError } from "../common/errors.js";
import { ACCESS_COOKIE_NAME, readCookie } from "./auth.cookies.js";
import type { Role } from "../models/user.model.js";
import { verifyAccessToken, type AuthUser } from "../services/auth.service.js";
import type { WorkspaceContext } from "./workspace.middleware.js";

export interface AuthenticatedRequest extends Request {
  auth?: AuthUser;
  workspace?: WorkspaceContext;
}

function bearerToken(authorization: string | undefined): string {
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) {
    throw new AppError(401, "AUTHENTICATION_REQUIRED", "A Bearer token is required");
  }

  return match[1];
}

export const authenticate: RequestHandler = async (request, response, next) => {
  try {
    const accessToken = readCookie(request, ACCESS_COOKIE_NAME);
    (request as AuthenticatedRequest).auth = await verifyAccessToken(
      accessToken ?? bearerToken(request.header("authorization"))
    );
    next();
  } catch (error) {
    const appError =
      error instanceof AppError
        ? error
        : new AppError(401, "INVALID_TOKEN", "Token is invalid or expired");
    response.status(appError.statusCode).json({
      error: { code: appError.code, message: appError.message }
    });
  }
};

export function requireRole(...roles: Role[]): RequestHandler {
  return async (request, response, next) => {
    await authenticate(request, response, () => {
      const user = (request as AuthenticatedRequest).auth;
      if (!user || !roles.includes(user.role)) {
        response.status(403).json({
          error: { code: "FORBIDDEN", message: "You do not have permission for this resource" }
        });
        return;
      }

      next();
    });
  };
}
