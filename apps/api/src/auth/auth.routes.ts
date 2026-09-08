import { Router } from "express";

import { AppError } from "../common/errors.js";
import { login, rotateRefreshToken } from "./auth.service.js";

export const authRouter = Router();

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
