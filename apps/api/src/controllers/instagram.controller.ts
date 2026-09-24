import type { RequestHandler } from "express";
import { isValidObjectId } from "mongoose";

import type { AuthenticatedRequest } from "../auth/auth.middleware.js";
import { AppError } from "../common/errors.js";
import { instagramAccountService } from "../services/instagram-account.service.js";
import { instagramOAuthService } from "../services/instagram-oauth.service.js";

function ownerId(request: AuthenticatedRequest): string {
  if (!request.workspace) throw new AppError(400, "WORKSPACE_SELECTION_REQUIRED", "Select a Workspace before continuing");
  if (request.workspace.role !== "owner" || request.auth?.id !== request.workspace.ownerUserId) {
    throw new AppError(403, "WORKSPACE_OWNER_REQUIRED", "Only the Workspace owner can manage Instagram connections");
  }
  return request.workspace.ownerUserId;
}

function callbackBase(): string {
  const configured = process.env.WEB_APP_URL;
  if (!configured) throw new AppError(503, "INSTAGRAM_OAUTH_NOT_CONFIGURED", "Instagram OAuth is not configured");
  const url = new URL(configured);
  if (!["http:", "https:"].includes(url.protocol)) throw new AppError(503, "INSTAGRAM_OAUTH_NOT_CONFIGURED", "Instagram OAuth is not configured");
  return url.origin;
}

export const startInstagramOAuth: RequestHandler = async (request, response, next) => {
  try { response.json(await instagramOAuthService.start(ownerId(request as AuthenticatedRequest))); }
  catch (error) { next(error); }
};

// Callback chỉ chuyển đến /dashboard trên origin cấu hình sẵn và không chuyển code/token.
export const finishInstagramOAuth: RequestHandler = async (request, response, next) => {
  let origin: string;
  try { origin = callbackBase(); } catch (error) { next(error); return; }
  const redirect = new URL("/dashboard", origin);
  try {
    const userId = ownerId(request as AuthenticatedRequest);
    const state = typeof request.query.state === "string" ? request.query.state : "";
    if (request.query.error) {
      await instagramOAuthService.cancel(userId, state);
      redirect.searchParams.set("instagram_oauth", "cancelled");
    } else {
      const code = typeof request.query.code === "string" ? request.query.code : "";
      await instagramOAuthService.finish(userId, state, code);
      redirect.searchParams.set("instagram_oauth", "success");
    }
  } catch (error) {
    redirect.searchParams.set("instagram_oauth", "error");
    redirect.searchParams.set("code", error instanceof AppError && /^INSTAGRAM_[A-Z_]+$/.test(error.code) ? error.code : "INSTAGRAM_OAUTH_FAILED");
  }
  response.redirect(302, redirect.toString());
};

export const listInstagramConnections: RequestHandler = async (request, response, next) => {
  try {
    const workspace = (request as AuthenticatedRequest).workspace;
    if (!workspace) throw new AppError(400, "WORKSPACE_SELECTION_REQUIRED", "Select a Workspace before continuing");
    const all = await instagramAccountService.list(workspace.ownerUserId);
    const connections = workspace.role === "staff"
      ? all.filter((row) => workspace.allowedChannels.some((channel) => channel.platform === "instagram" && channel.channelId === row.instagramUserId))
      : all;
    response.json({ connections });
  } catch (error) { next(error); }
};

export const removeInstagramConnection: RequestHandler = async (request, response, next) => {
  try {
    const userId = ownerId(request as AuthenticatedRequest);
    const connectionId = request.params.connectionId;
    if (typeof connectionId !== "string" || !isValidObjectId(connectionId)) throw new AppError(400, "INVALID_PARAMETER", "Connection ID is invalid");
    response.json(await instagramAccountService.disconnect(userId, connectionId));
  } catch (error) { next(error); }
};
