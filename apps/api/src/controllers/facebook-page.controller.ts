import type { RequestHandler } from "express";

import type { AuthenticatedRequest } from "../auth/auth.middleware.js";
import { AppError } from "../common/errors.js";
import { facebookPageConnectionSchema } from "../schemas/facebook-page.schemas.js";
import { facebookPageService } from "../services/facebook-page.service.js";

function authenticatedUserId(request: AuthenticatedRequest): string {
  const id = request.auth?.id;
  if (!id) throw new AppError(401, "AUTHENTICATION_REQUIRED", "Authentication is required");
  return id;
}

export const getFacebookPage: RequestHandler = async (request, response, next) => {
  try {
    const connection = await facebookPageService.get(authenticatedUserId(request as AuthenticatedRequest));
    if (!connection) {
      response.status(404).json({ error: { code: "FACEBOOK_PAGE_NOT_CONNECTED", message: "Facebook Page is not connected" } });
      return;
    }
    response.json(connection);
  } catch (error) {
    next(error);
  }
};

export const connectFacebookPage: RequestHandler = async (request, response, next) => {
  try {
    const input = facebookPageConnectionSchema.safeParse(request.body);
    if (!input.success) throw new AppError(400, "INVALID_REQUEST", "Facebook Page connection data is invalid");
    response.status(201).json(await facebookPageService.connect(authenticatedUserId(request as AuthenticatedRequest), input.data));
  } catch (error) {
    next(error);
  }
};

export const removeFacebookPage: RequestHandler = async (request, response, next) => {
  try {
    await facebookPageService.remove(authenticatedUserId(request as AuthenticatedRequest));
    response.status(204).send();
  } catch (error) {
    next(error);
  }
};
