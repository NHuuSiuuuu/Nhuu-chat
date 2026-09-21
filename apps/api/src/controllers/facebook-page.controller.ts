import type { RequestHandler } from "express";

import type { AuthenticatedRequest } from "../auth/auth.middleware.js";
import { AppError } from "../common/errors.js";
import { facebookPageConnectionSchema } from "../schemas/facebook-page.schemas.js";
import { facebookPageService } from "../services/facebook-page.service.js";
import { facebookOAuthService } from "../services/facebook-oauth.service.js";

export function authenticatedUserId(request: AuthenticatedRequest): string {
  const id = request.auth?.id;
  if (!id) throw new AppError(401, "AUTHENTICATION_REQUIRED", "Authentication is required");
  return id;
}

export const startFacebookOAuth: RequestHandler = async (request, response, next) => {
  try {
    response.json(await facebookOAuthService.start(authenticatedUserId(request as AuthenticatedRequest)));
  } catch (error) {
    next(error);
  }
};

export const finishFacebookOAuth: RequestHandler = async (request, response) => {
  const redirectBase = process.env.WEB_APP_URL;
  try {
    if (!redirectBase) throw new AppError(503, "FACEBOOK_OAUTH_NOT_CONFIGURED", "Facebook OAuth is not configured");
    const code = typeof request.query.code === "string" ? request.query.code : "";
    const state = typeof request.query.state === "string" ? request.query.state : "";
    if (!code || !state) throw new AppError(400, "FACEBOOK_OAUTH_CALLBACK_INVALID", "Facebook OAuth callback is invalid");
    const result = await facebookOAuthService.finish(state, code);
    const redirect = new URL("/dashboard", redirectBase);
    redirect.searchParams.set("facebook_oauth", "select");
    redirect.searchParams.set("selection", result.selectionToken);
    response.redirect(302, redirect.toString());
  } catch (error) {
    const redirect = new URL("/dashboard", redirectBase ?? "http://localhost:5173");
    redirect.searchParams.set("facebook_oauth", "error");
    redirect.searchParams.set("code", error instanceof AppError ? error.code : "FACEBOOK_OAUTH_FAILED");
    response.redirect(302, redirect.toString());
  }
};

export const listFacebookOAuthPages: RequestHandler = async (request, response, next) => {
  try {
    const selection = typeof request.query.selection === "string" ? request.query.selection : "";
    if (!selection) throw new AppError(400, "FACEBOOK_OAUTH_SELECTION_INVALID", "Facebook Page selection is invalid or expired");
    response.json(await facebookOAuthService.getSelection(authenticatedUserId(request as AuthenticatedRequest), selection));
  } catch (error) {
    next(error);
  }
};

export const selectFacebookOAuthPage: RequestHandler = async (request, response, next) => {
  try {
    const selection = typeof request.body?.selectionToken === "string" ? request.body.selectionToken : "";
    const pageId = typeof request.body?.pageId === "string" ? request.body.pageId : "";
    if (!selection || !pageId) throw new AppError(400, "INVALID_REQUEST", "Facebook Page selection is invalid");
    response.status(201).json(await facebookOAuthService.select(
      authenticatedUserId(request as AuthenticatedRequest),
      selection,
      pageId,
      (userId, input) => facebookPageService.connect(userId, input)
    ));
  } catch (error) {
    next(error);
  }
};

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
