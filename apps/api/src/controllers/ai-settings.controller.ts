import type { RequestHandler } from "express";

import type { AuthenticatedRequest } from "../auth/auth.middleware.js";
import { AppError } from "../common/errors.js";
import { aiSettingsPatchSchema } from "../schemas/ai-settings.schemas.js";
import { getAiSettings as getAiSettingsRecord, updateAiSettings as updateAiSettingsRecord } from "../services/ai-settings.service.js";

function authenticatedUserId(request: Parameters<RequestHandler>[0]): string {
  const id = (request as AuthenticatedRequest).auth?.id;
  if (!id) throw new AppError(401, "AUTHENTICATION_REQUIRED", "Authentication is required");
  return id;
}

export const getAiSettings: RequestHandler = async (request, response, next) => {
  try {
    response.json(await getAiSettingsRecord(authenticatedUserId(request)));
  } catch (error) {
    next(error);
  }
};

export const updateAiSettings: RequestHandler = async (request, response, next) => {
  try {
    const body = aiSettingsPatchSchema.safeParse(request.body);
    if (!body.success) throw new AppError(400, "INVALID_REQUEST", "AI settings are invalid");
    response.json(await updateAiSettingsRecord(authenticatedUserId(request), body.data));
  } catch (error) {
    next(error);
  }
};
