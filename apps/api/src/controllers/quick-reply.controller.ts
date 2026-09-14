import type { RequestHandler } from "express";

import type { AuthenticatedRequest } from "../auth/auth.middleware.js";
import { AppError } from "../common/errors.js";
import {
  quickReplyCreateSchema,
  quickReplyIdSchema,
  quickReplyUpdateSchema
} from "../schemas/quick-reply.schemas.js";
import {
  createQuickReply as createReply,
  deleteQuickReply as deleteReply,
  listQuickReplies as listReplies,
  updateQuickReply as updateReply,
  type UploadedFile
} from "../services/quick-reply.service.js";

function authenticatedUserId(request: Parameters<RequestHandler>[0]): string {
  const id = (request as AuthenticatedRequest).auth?.id;
  if (!id) throw new AppError(401, "AUTHENTICATION_REQUIRED", "Authentication is required");
  return id;
}

function replyId(params: unknown): string {
  const result = quickReplyIdSchema.safeParse(params);
  if (!result.success) throw new AppError(400, "INVALID_REQUEST", "Quick reply id is required");
  return result.data.id;
}

function uploadedFile(request: Parameters<RequestHandler>[0]): UploadedFile | undefined {
  const file = request.file;
  if (!file) return undefined;

  return {
    buffer: file.buffer,
    originalname: file.originalname,
    mimetype: file.mimetype,
    size: file.size
  };
}

export const listQuickReplies: RequestHandler = async (request, response, next) => {
  try {
    response.json(await listReplies(authenticatedUserId(request)));
  } catch (error) {
    next(error);
  }
};

export const createQuickReply: RequestHandler = async (request, response, next) => {
  try {
    const body = quickReplyCreateSchema.safeParse(request.body);
    if (!body.success) {
      throw new AppError(400, "INVALID_REQUEST", "shortcut and message are required");
    }

    const attachment = uploadedFile(request);
    response.status(201).json(await createReply(authenticatedUserId(request), {
      ...body.data,
      ...(attachment ? { attachment } : {})
    }));
  } catch (error) {
    next(error);
  }
};

export const updateQuickReply: RequestHandler = async (request, response, next) => {
  try {
    const body = quickReplyUpdateSchema.safeParse(request.body);
    const attachment = uploadedFile(request);
    if (!body.success || (body.data.shortcut === undefined
      && body.data.message === undefined
      && attachment === undefined)) {
      throw new AppError(400, "INVALID_REQUEST", "shortcut, message, or attachment is required");
    }

    response.json(await updateReply(
      authenticatedUserId(request),
      replyId(request.params),
      { ...body.data, ...(attachment ? { attachment } : {}) }
    ));
  } catch (error) {
    next(error);
  }
};

export const deleteQuickReply: RequestHandler = async (request, response, next) => {
  try {
    await deleteReply(authenticatedUserId(request), replyId(request.params));
    response.status(204).send();
  } catch (error) {
    next(error);
  }
};
