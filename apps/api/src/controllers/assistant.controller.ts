import type { RequestHandler } from "express";

import type { AuthenticatedRequest } from "../auth/auth.middleware.js";
import { AppError } from "../common/errors.js";
import { assistantCreateSchema, assistantPatchSchema } from "../schemas/assistant.schemas.js";
import {
  createAssistant as createAssistantRecord,
  deleteAssistant as deleteAssistantRecord,
  listAssistants as listAssistantRecords,
  updateAssistant as updateAssistantRecord
} from "../services/assistant.service.js";

function authenticatedOwnerId(request: Parameters<RequestHandler>[0]): string {
  const id = (request as AuthenticatedRequest).auth?.id;
  if (!id) throw new AppError(401, "AUTHENTICATION_REQUIRED", "Authentication is required");
  return id;
}

function objectId(value: unknown, name: string): string {
  if (typeof value !== "string" || !/^[0-9a-f]{24}$/i.test(value)) {
    throw new AppError(400, "INVALID_REQUEST", `${name} is invalid`);
  }
  return value;
}

export function assistantIdFromRequest(request: Parameters<RequestHandler>[0]): string {
  return objectId(request.params.assistantId, "Assistant id");
}

export const listAssistants: RequestHandler = async (request, response, next) => {
  try {
    response.json(await listAssistantRecords(authenticatedOwnerId(request)));
  } catch (error) {
    next(error);
  }
};

export const createAssistant: RequestHandler = async (request, response, next) => {
  try {
    const body = assistantCreateSchema.safeParse(request.body);
    if (!body.success) throw new AppError(400, "INVALID_REQUEST", "Assistant data is invalid");
    response.status(201).json(await createAssistantRecord(authenticatedOwnerId(request), body.data));
  } catch (error) {
    next(error);
  }
};

export const updateAssistant: RequestHandler = async (request, response, next) => {
  try {
    const body = assistantPatchSchema.safeParse(request.body);
    if (!body.success || Object.keys(body.data).length === 0) {
      throw new AppError(400, "INVALID_REQUEST", "Assistant patch is invalid");
    }
    response.json(await updateAssistantRecord(
      authenticatedOwnerId(request),
      assistantIdFromRequest(request),
      body.data
    ));
  } catch (error) {
    next(error);
  }
};

export const deleteAssistant: RequestHandler = async (request, response, next) => {
  try {
    await deleteAssistantRecord(authenticatedOwnerId(request), assistantIdFromRequest(request));
    response.status(204).send();
  } catch (error) {
    next(error);
  }
};
