import type { RequestHandler } from "express";

import type { AuthenticatedRequest } from "../auth/auth.middleware.js";
import { AppError } from "../common/errors.js";
import {
  telegramPersonalQrIdSchema,
  telegramPersonalQrPasswordSchema
} from "../schemas/telegram-personal.schemas.js";
import {
  getPersonalQrLoginStatus,
  getPersonalSessionStatus,
  startPersonalQrLogin,
  submitPersonalQrPassword
} from "../services/telegram-personal.service.js";

function authenticatedUserId(request: AuthenticatedRequest): string {
  const userId = request.auth?.id;
  if (!userId) throw new Error("Authenticated user is missing");
  return userId;
}

function qrLoginId(params: unknown): string {
  const result = telegramPersonalQrIdSchema.safeParse(params);
  if (!result.success) {
    throw new Error("QR login id is missing");
  }
  return result.data.id;
}

export const getSessionStatus: RequestHandler = async (request, response, next) => {
  try {
    response.json(await getPersonalSessionStatus(authenticatedUserId(request)));
  } catch (error) {
    next(error);
  }
};

export const startQrLogin: RequestHandler = async (request, response, next) => {
  try {
    response.status(201).json(await startPersonalQrLogin(authenticatedUserId(request)));
  } catch (error) {
    next(error);
  }
};

export const getQrLoginStatus: RequestHandler = (request, response, next) => {
  try {
    const userId = authenticatedUserId(request);
    response.json(getPersonalQrLoginStatus(qrLoginId(request.params), userId));
  } catch (error) {
    next(error);
  }
};

export const submitQrPassword: RequestHandler = (request, response, next) => {
  try {
    const userId = authenticatedUserId(request);
    const id = telegramPersonalQrIdSchema.safeParse(request.params);
    const password = telegramPersonalQrPasswordSchema.safeParse(request.body);
    // This endpoint already mapped both missing IDs and passwords to AppError 400.
    if (!id.success || !password.success) {
      throw new AppError(400, "INVALID_REQUEST", "Telegram 2FA password is required");
    }
    response.json(submitPersonalQrPassword(id.data.id, userId, password.data.password));
  } catch (error) {
    next(error);
  }
};
