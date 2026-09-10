import type { RequestHandler } from "express";

import { AppError } from "../common/errors.js";
import {
  conversationTagIdSchema,
  conversationTagInputSchema,
  conversationTagUpdateSchema
} from "../schemas/conversation-tag.schemas.js";
import {
  createConversationTag as createTag,
  deleteConversationTag as deleteTag,
  listConversationTags as listTags,
  updateConversationTag as updateTag
} from "../services/conversation-tag.service.js";

function tagId(params: unknown): string {
  const result = conversationTagIdSchema.safeParse(params);
  if (!result.success) throw new AppError(400, "INVALID_REQUEST", "Conversation tag id is required");
  return result.data.id;
}

export const listConversationTags: RequestHandler = async (_request, response, next) => {
  try {
    response.json(await listTags());
  } catch (error) {
    next(error);
  }
};

export const createConversationTag: RequestHandler = async (request, response, next) => {
  try {
    const body = conversationTagInputSchema.safeParse(request.body);
    if (!body.success) throw new AppError(400, "INVALID_REQUEST", "name and color are invalid");
    response.status(201).json(await createTag(body.data));
  } catch (error) {
    next(error);
  }
};

export const updateConversationTag: RequestHandler = async (request, response, next) => {
  try {
    const body = conversationTagUpdateSchema.safeParse(request.body);
    if (!body.success) throw new AppError(400, "INVALID_REQUEST", "name or color is required");
    response.json(await updateTag(tagId(request.params), body.data));
  } catch (error) {
    next(error);
  }
};

export const deleteConversationTag: RequestHandler = async (request, response, next) => {
  try {
    await deleteTag(tagId(request.params));
    response.status(204).send();
  } catch (error) {
    next(error);
  }
};
