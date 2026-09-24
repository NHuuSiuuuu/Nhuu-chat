import type { RequestHandler } from "express";

import type { AuthenticatedRequest } from "../auth/auth.middleware.js";
import { AppError } from "../common/errors.js";
import { facebookPostCreateSchema, facebookPostIdSchema, facebookPostListSchema, facebookPostRetrySchema, facebookPostUpdateSchema } from "../schemas/facebook-post.schemas.js";
import { facebookPostService } from "../services/facebook-post.service.js";
import { facebookPageService } from "../services/facebook-page.service.js";

function userId(request: AuthenticatedRequest): string {
  if (!request.auth?.id) throw new AppError(401, "AUTHENTICATION_REQUIRED", "Authentication is required");
  return request.workspace?.ownerUserId ?? request.auth.id;
}
function allowedPages(request: AuthenticatedRequest): string[] | undefined {
  return request.workspace?.allowedPages ?? undefined;
}
function assertPageAccess(request: AuthenticatedRequest, pageId: string) {
  const pages = allowedPages(request);
  if (pages && !pages.includes(pageId)) throw new AppError(404, "FACEBOOK_PAGE_NOT_FOUND", "Facebook Page was not found");
}
function postId(params: unknown): string {
  const parsed = facebookPostIdSchema.safeParse(params);
  if (!parsed.success) throw new AppError(400, "INVALID_REQUEST", "Post id is required");
  return parsed.data.id;
}

export const listFacebookPosts: RequestHandler = async (request, response, next) => {
  try {
    const filters = facebookPostListSchema.safeParse(request.query);
    if (!filters.success) throw new AppError(400, "INVALID_REQUEST", "Post filters are invalid");
    const authRequest = request as AuthenticatedRequest;
    if (filters.data.pageId) assertPageAccess(authRequest, filters.data.pageId);
    response.json(await facebookPostService.listPosts(userId(authRequest), { ...filters.data, ...(filters.data.pageId ? {} : allowedPages(authRequest) ? { pageIds: allowedPages(authRequest) } : {}) }));
  } catch (error) { next(error); }
};

export const createFacebookPost: RequestHandler = async (request, response, next) => {
  try {
    const body = facebookPostCreateSchema.safeParse(request.body);
    if (!body.success) throw new AppError(400, "INVALID_REQUEST", "Post data is invalid");
    const authRequest = request as AuthenticatedRequest;
    let pageId = body.data.pageId;
    const availablePages = await facebookPageService.list(userId(authRequest));
    const accessiblePages = allowedPages(authRequest)
      ? availablePages.filter((page) => allowedPages(authRequest)?.includes(page.pageId))
      : availablePages;
    if (authRequest.workspace && accessiblePages.length === 0) throw new AppError(403, "FACEBOOK_PAGE_ACCESS_DENIED", "No Facebook Page is available in this Workspace");
    if (!pageId && accessiblePages.length === 1) pageId = accessiblePages[0].pageId;
    if (pageId) assertPageAccess(authRequest, pageId);
    else if (accessiblePages.length > 1) throw new AppError(400, "FACEBOOK_PAGE_SELECTION_REQUIRED", "Select a Facebook Page before publishing");
    else throw new AppError(409, "FACEBOOK_PAGE_NOT_CONNECTED", "Facebook Page is not connected");
    response.status(201).json(await facebookPostService.createPost(userId(authRequest), { ...body.data, pageId, ...(request.file ? { file: request.file } : {}) }));
  } catch (error) { next(error); }
};

export const updateFacebookPost: RequestHandler = async (request, response, next) => {
  try {
    const body = facebookPostUpdateSchema.safeParse(request.body);
    if (!body.success) throw new AppError(400, "INVALID_REQUEST", "Post data is invalid");
    const authRequest = request as AuthenticatedRequest;
    response.json(await facebookPostService.updatePost(userId(authRequest), postId(request.params), { ...body.data, ...(request.file ? { file: request.file } : {}) }, allowedPages(authRequest)));
  } catch (error) { next(error); }
};

export const retryFacebookPost: RequestHandler = async (request, response, next) => {
  try {
    const body = facebookPostRetrySchema.safeParse(request.body);
    if (!body.success) throw new AppError(400, "INVALID_REQUEST", "Retry mode is invalid");
    const authRequest = request as AuthenticatedRequest;
    response.json(await facebookPostService.retryPost(userId(authRequest), postId(request.params), body.data.mode, allowedPages(authRequest)));
  } catch (error) { next(error); }
};

export const cancelFacebookPost: RequestHandler = async (request, response, next) => {
  try { const authRequest = request as AuthenticatedRequest; await facebookPostService.cancelPost(userId(authRequest), postId(request.params), allowedPages(authRequest)); response.status(204).send(); } catch (error) { next(error); }
};
