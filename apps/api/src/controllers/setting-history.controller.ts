import type { RequestHandler } from "express";

import type { AuthenticatedRequest } from "../auth/auth.middleware.js";
import { AppError } from "../common/errors.js";
import { settingHistoryListQuerySchema } from "../schemas/setting-history.schemas.js";
import { listSettingHistories } from "../services/setting-history.service.js";

function authenticatedUserId(request: Parameters<RequestHandler>[0]): string {
  const id = (request as AuthenticatedRequest).auth?.id;
  if (!id) throw new AppError(401, "AUTHENTICATION_REQUIRED", "Authentication is required");
  return id;
}

export const getSettingHistories: RequestHandler = async (request, response, next) => {
  try {
    const query = settingHistoryListQuerySchema.safeParse(request.query);
    if (!query.success) {
      throw new AppError(400, "INVALID_REQUEST", "Setting history filters are invalid");
    }
    response.json(await listSettingHistories({
      ...query.data,
      userId: authenticatedUserId(request)
    }));
  } catch (error) {
    next(error);
  }
};
