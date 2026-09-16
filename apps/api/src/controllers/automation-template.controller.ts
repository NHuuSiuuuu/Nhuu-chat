import type { RequestHandler } from "express";

import type { AuthenticatedRequest } from "../auth/auth.middleware.js";
import { AppError } from "../common/errors.js";
import {
  automationTemplateCreateSchema,
  automationTemplateImportSchema,
  automationTemplatePatchSchema
} from "../schemas/automation-template.schemas.js";
import {
  createAutomationTemplate as createTemplateRecord,
  deleteAutomationTemplate as deleteTemplateRecord,
  importAutomationTemplates as importTemplateRecords,
  listAutomationTemplates as listTemplateRecords,
  updateAutomationTemplate as updateTemplateRecord
} from "../services/automation-template.service.js";

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

function assistantId(request: Parameters<RequestHandler>[0]): string {
  return objectId(request.params.assistantId, "Assistant id");
}

function templateId(request: Parameters<RequestHandler>[0]): string {
  return objectId(request.params.templateId, "Template id");
}

export const listAutomationTemplates: RequestHandler = async (request, response, next) => {
  try {
    response.json(await listTemplateRecords(authenticatedOwnerId(request), assistantId(request)));
  } catch (error) {
    next(error);
  }
};

export const createAutomationTemplate: RequestHandler = async (request, response, next) => {
  try {
    const routeAssistantId = assistantId(request);
    const body = automationTemplateCreateSchema.safeParse(request.body);
    if (!body.success || body.data.assistantId !== routeAssistantId) {
      throw new AppError(400, "INVALID_REQUEST", "Automation template data is invalid");
    }
    response.status(201).json(await createTemplateRecord(authenticatedOwnerId(request), body.data));
  } catch (error) {
    next(error);
  }
};

export const importAutomationTemplates: RequestHandler = async (request, response, next) => {
  try {
    const body = automationTemplateImportSchema.safeParse(request.body);
    if (!body.success) throw new AppError(400, "INVALID_REQUEST", "Automation template import data is invalid");
    response.json(await importTemplateRecords(
      authenticatedOwnerId(request),
      assistantId(request),
      body.data.templates
    ));
  } catch (error) {
    next(error);
  }
};

export const updateAutomationTemplate: RequestHandler = async (request, response, next) => {
  try {
    const routeAssistantId = assistantId(request);
    const body = automationTemplatePatchSchema.safeParse(request.body);
    if (!body.success || Object.keys(body.data).length === 0 ||
      (body.data.assistantId !== undefined && body.data.assistantId !== routeAssistantId)) {
      throw new AppError(400, "INVALID_REQUEST", "Automation template patch is invalid");
    }
    response.json(await updateTemplateRecord(
      authenticatedOwnerId(request),
      routeAssistantId,
      templateId(request),
      body.data
    ));
  } catch (error) {
    next(error);
  }
};

export const deleteAutomationTemplate: RequestHandler = async (request, response, next) => {
  try {
    await deleteTemplateRecord(
      authenticatedOwnerId(request),
      assistantId(request),
      templateId(request)
    );
    response.status(204).send();
  } catch (error) {
    next(error);
  }
};
