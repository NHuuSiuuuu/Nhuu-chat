import type { RequestHandler } from "express";

import { AppError } from "../common/errors.js";
import {
  login as loginUser,
  register as registerUser,
  revokeRefreshToken,
  rotateRefreshToken
} from "../services/auth.service.js";
import { loginSchema, registerSchema } from "../schemas/auth.schemas.js";
import { clearAuthCookies, REFRESH_COOKIE_NAME, readCookie, setAuthCookies } from "../auth/auth.cookies.js";
import type { AuthenticatedRequest } from "../auth/auth.middleware.js";

export const register: RequestHandler = async (request, response, next) => {
  try {
    // Preserve the baseline failure before validation when no body was parsed.
    const { name, email, password } = request.body as Record<string, unknown>;
    const result = registerSchema.safeParse({ name, email, password });
    if (!result.success) {
      throw new AppError(
        400,
        "INVALID_REQUEST",
        "Name, email and a password of at least 8 characters are required"
      );
    }

    const { user, tokens } = await registerUser(result.data.name, result.data.email, result.data.password);
    setAuthCookies(response, tokens);
    response.status(201).json({ user });
  } catch (error) {
    next(error);
  }
};

export const login: RequestHandler = async (request, response, next) => {
  try {
    const { email, password } = request.body as Record<string, unknown>;
    const result = loginSchema.safeParse({ email, password });
    if (!result.success) {
      throw new AppError(400, "INVALID_REQUEST", "Email and password are required");
    }

    const { user, tokens } = await loginUser(result.data.email, result.data.password);
    setAuthCookies(response, tokens);
    response.status(200).json({ user });
  } catch (error) {
    next(error);
  }
};

export const refresh: RequestHandler = async (request, response, next) => {
  try {
    const refreshToken = readCookie(request, REFRESH_COOKIE_NAME);
    if (!refreshToken) {
      throw new AppError(401, "AUTHENTICATION_REQUIRED", "Refresh token is required");
    }

    const result = await rotateRefreshToken(refreshToken);
    setAuthCookies(response, result.tokens);
    response.status(200).json({ user: result.user });
  } catch (error) {
    next(error);
  }
};

export const session: RequestHandler = (request, response) => {
  response.status(200).json({ user: (request as AuthenticatedRequest).auth });
};

export const logout: RequestHandler = async (request, response, next) => {
  try {
    const refreshToken = readCookie(request, REFRESH_COOKIE_NAME);
    if (refreshToken) await revokeRefreshToken(refreshToken);
    clearAuthCookies(response);
    response.status(204).send();
  } catch (error) {
    clearAuthCookies(response);
    next(error);
  }
};
