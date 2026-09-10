import type { RequestHandler } from "express";

import { AppError } from "../common/errors.js";
import {
  login as loginUser,
  register as registerUser,
  rotateRefreshToken
} from "../services/auth.service.js";
import { loginSchema, refreshSchema, registerSchema } from "../schemas/auth.schemas.js";

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
    response.status(201).json({ user, ...tokens });
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
    response.status(200).json({ user, ...tokens });
  } catch (error) {
    next(error);
  }
};

export const refresh: RequestHandler = async (request, response, next) => {
  try {
    const { refreshToken } = request.body as Record<string, unknown>;
    const result = refreshSchema.safeParse({ refreshToken });
    if (!result.success) {
      throw new AppError(400, "INVALID_REQUEST", "Refresh token is required");
    }

    response.status(200).json(await rotateRefreshToken(result.data.refreshToken));
  } catch (error) {
    next(error);
  }
};
