import { Router } from "express";

import { requireRole, type AuthenticatedRequest } from "../../auth/auth.middleware.js";
import { AppError } from "../../common/errors.js";
import { getPersonalQrLoginStatus, getPersonalSessionStatus, startPersonalQrLogin, submitPersonalQrPassword } from "./telegram-personal.service.js";

export const telegramPersonalRouter = Router();

telegramPersonalRouter.get("/status", requireRole("admin", "agent", "customer"), async (request, response, next) => {
  try {
    const userId = (request as AuthenticatedRequest).auth?.id;
    if (!userId) throw new Error("Authenticated user is missing");
    response.json(await getPersonalSessionStatus(userId));
  } catch (error) { next(error); }
});

telegramPersonalRouter.post("/qr", requireRole("admin", "agent", "customer"), async (request, response, next) => {
  try {
    const userId = (request as AuthenticatedRequest).auth?.id;
    if (!userId) throw new Error("Authenticated user is missing");
    response.status(201).json(await startPersonalQrLogin(userId));
  } catch (error) { next(error); }
});

telegramPersonalRouter.get("/qr/:id", requireRole("admin", "agent", "customer"), (request, response, next) => {
  try {
    const userId = (request as AuthenticatedRequest).auth?.id;
    if (!userId) throw new Error("Authenticated user is missing");
    const id = Array.isArray(request.params.id) ? request.params.id[0] : request.params.id;
    if (!id) throw new Error("QR login id is missing");
    response.json(getPersonalQrLoginStatus(id, userId));
  } catch (error) { next(error); }
});

telegramPersonalRouter.post("/qr/:id/password", requireRole("admin", "agent", "customer"), (request, response, next) => {
  try {
    const userId = (request as AuthenticatedRequest).auth?.id;
    if (!userId) throw new Error("Authenticated user is missing");
    const id = Array.isArray(request.params.id) ? request.params.id[0] : request.params.id;
    const password = request.body?.password;
    if (!id || typeof password !== "string" || !password.trim()) {
      throw new AppError(400, "INVALID_REQUEST", "Telegram 2FA password is required");
    }
    response.json(submitPersonalQrPassword(id, userId, password));
  } catch (error) { next(error); }
});
