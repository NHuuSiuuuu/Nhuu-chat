import { Router } from "express";

import { AppError } from "../common/errors.js";
import { login, register, rotateRefreshToken } from "./auth.service.js";

export const authRouter = Router();

authRouter.post("/register", async (request, response, next) => {
  try {
    const { name, email, password } = request.body as Record<string, unknown>;
    if (
      typeof name !== "string" ||
      !name.trim() ||
      typeof email !== "string" ||
      !email.trim() ||
      typeof password !== "string" ||
      password.length < 8
    ) {
      throw new AppError(
        400,
        "INVALID_REQUEST",
        "Name, email and a password of at least 8 characters are required"
      );
    }

    const { user, tokens } = await register(name, email, password);
    response.status(201).json({ user, ...tokens });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/login", async (request, response, next) => {
  try {
    const { email, password } = request.body as Record<string, unknown>;
    if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
      throw new AppError(400, "INVALID_REQUEST", "Email and password are required");
    }

    const { user, tokens } = await login(email, password);
    response.status(200).json({ user, ...tokens });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/refresh", async (request, response, next) => {
  try {
    const { refreshToken } = request.body as Record<string, unknown>;
    if (typeof refreshToken !== "string" || !refreshToken) {
      throw new AppError(400, "INVALID_REQUEST", "Refresh token is required");
    }

    response.status(200).json(await rotateRefreshToken(refreshToken));
  } catch (error) {
    next(error);
  }
});
