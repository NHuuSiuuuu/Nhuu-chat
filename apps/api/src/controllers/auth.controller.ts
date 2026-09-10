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
    const result = registerSchema.safeParse(request.body);
    if (!result.success) {
      throw new AppError(
        400,
        "INVALID_REQUEST",
        "Name, email and a password of at least 8 characters are required"
      );
    }

    const { name, email, password } = result.data;
    const { user, tokens } = await registerUser(name, email, password);
    response.status(201).json({ user, ...tokens });
  } catch (error) {
    next(error);
  }
};

export const login: RequestHandler = async (request, response, next) => {
  try {
    const result = loginSchema.safeParse(request.body);
    if (!result.success) {
      throw new AppError(400, "INVALID_REQUEST", "Email and password are required");
    }

    const { email, password } = result.data;
    const { user, tokens } = await loginUser(email, password);
    response.status(200).json({ user, ...tokens });
  } catch (error) {
    next(error);
  }
};

export const refresh: RequestHandler = async (request, response, next) => {
  try {
    const result = refreshSchema.safeParse(request.body);
    if (!result.success) {
      throw new AppError(400, "INVALID_REQUEST", "Refresh token is required");
    }

    response.status(200).json(await rotateRefreshToken(result.data.refreshToken));
  } catch (error) {
    next(error);
  }
};
