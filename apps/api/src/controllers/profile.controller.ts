import type { RequestHandler } from "express";

import type { AuthenticatedRequest } from "../auth/auth.middleware.js";
import { AppError } from "../common/errors.js";
import { changePassword as changePasswordRecord, getCurrentUser as getCurrentUserRecord, updateCurrentUser as updateCurrentUserRecord } from "../services/profile.service.js";

function authenticatedUserId(request: Parameters<RequestHandler>[0]): string {
  const id = (request as AuthenticatedRequest).auth?.id;
  if (!id) throw new AppError(401, "AUTHENTICATION_REQUIRED", "Authentication is required");
  return id;
}

export const getCurrentUser: RequestHandler = async (request, response, next) => {
  try { response.json(await getCurrentUserRecord(authenticatedUserId(request))); } catch (error) { next(error); }
};

export const updateCurrentUser: RequestHandler = async (request, response, next) => {
  try {
    const displayName = request.body?.displayName;
    if (typeof displayName !== "string" || !displayName.trim()) throw new AppError(400, "INVALID_REQUEST", "Display name is required");
    response.json(await updateCurrentUserRecord(authenticatedUserId(request), displayName.trim()));
  } catch (error) { next(error); }
};

export const changePassword: RequestHandler = async (request, response, next) => {
  try {
    const { currentPassword, newPassword } = request.body ?? {};
    if (typeof currentPassword !== "string" || typeof newPassword !== "string" || newPassword.length < 8) {
      throw new AppError(400, "INVALID_REQUEST", "Current password and a new password of at least 8 characters are required");
    }
    await changePasswordRecord(authenticatedUserId(request), currentPassword, newPassword);
    response.status(204).send();
  } catch (error) { next(error); }
};
