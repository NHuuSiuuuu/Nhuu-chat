import type { RequestHandler } from "express";

import type { AuthenticatedRequest } from "../auth/auth.middleware.js";
import { AppError } from "../common/errors.js";
import { facebookPostCreateSchema, facebookPostIdSchema, facebookPostListSchema, facebookPostRetrySchema, facebookPostUpdateSchema } from "../schemas/facebook-post.schemas.js";
import { facebookPostService } from "../services/facebook-post.service.js";

function userId(request: AuthenticatedRequest): string {
  if (!request.auth?.id) throw new AppError(401, "AUTHENTICATION_REQUIRED", "Authentication is required");
  return request.auth.id;
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
    response.json(await facebookPostService.listPosts(userId(request as AuthenticatedRequest), filters.data));
  } catch (error) { next(error); }
};

export const createFacebookPost: RequestHandler = async (request, response, next) => {
  try {
    const body = facebookPostCreateSchema.safeParse(request.body);
    if (!body.success) throw new AppError(400, "INVALID_REQUEST", "Post data is invalid");
    response.status(201).json(await facebookPostService.createPost(userId(request as AuthenticatedRequest), { ...body.data, ...(request.file ? { file: request.file } : {}) }));
  } catch (error) { next(error); }
};

export const updateFacebookPost: RequestHandler = async (request, response, next) => {
  try {
    const body = facebookPostUpdateSchema.safeParse(request.body);
    if (!body.success) throw new AppError(400, "INVALID_REQUEST", "Post data is invalid");
    response.json(await facebookPostService.updatePost(userId(request as AuthenticatedRequest), postId(request.params), { ...body.data, ...(request.file ? { file: request.file } : {}) }));
  } catch (error) { next(error); }
};

export const retryFacebookPost: RequestHandler = async (request, response, next) => {
  try {
    const body = facebookPostRetrySchema.safeParse(request.body);
    if (!body.success) throw new AppError(400, "INVALID_REQUEST", "Retry mode is invalid");
    response.json(await facebookPostService.retryPost(userId(request as AuthenticatedRequest), postId(request.params), body.data.mode));
  } catch (error) { next(error); }
};

export const cancelFacebookPost: RequestHandler = async (request, response, next) => {
  try { await facebookPostService.cancelPost(userId(request as AuthenticatedRequest), postId(request.params)); response.status(204).send(); } catch (error) { next(error); }
};
