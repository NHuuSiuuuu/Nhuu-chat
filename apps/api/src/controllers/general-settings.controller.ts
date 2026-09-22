import type { RequestHandler } from "express";

import type { AuthenticatedRequest } from "../auth/auth.middleware.js";
import { AppError } from "../common/errors.js";
import { generalSettingsPatchSchema } from "../schemas/general-settings.schemas.js";
import {
  getGeneralSettings as getGeneralSettingsRecord,
  updateGeneralSettings as updateGeneralSettingsRecord
} from "../services/general-settings.service.js";

function authenticatedUserId(request: Parameters<RequestHandler>[0]): string {
  const id = (request as AuthenticatedRequest).auth?.id;
  if (!id) throw new AppError(401, "AUTHENTICATION_REQUIRED", "Authentication is required");
  return id;
}

export const getGeneralSettings: RequestHandler = async (request, response, next) => {
  try {
    response.json(await getGeneralSettingsRecord(authenticatedUserId(request)));
  } catch (error) {
    next(error);
  }
};

export const updateGeneralSettings: RequestHandler = async (request, response, next) => {
  try {
    const body = generalSettingsPatchSchema.safeParse(request.body);
    if (!body.success) {
      throw new AppError(400, "INVALID_REQUEST", "General settings are invalid");
    }
    response.json(await updateGeneralSettingsRecord(authenticatedUserId(request), body.data));
  } catch (error) {
    next(error);
  }
};
