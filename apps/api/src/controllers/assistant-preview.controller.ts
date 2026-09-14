import type { RequestHandler } from "express";
import { z } from "zod";

import type { AuthenticatedRequest } from "../auth/auth.middleware.js";
import { AppError } from "../common/errors.js";
import { previewAssistantReply } from "../chatbot/preview.service.js";

const previewInputSchema = z.object({
  message: z.string().trim().min(1).max(2_000),
  history: z.array(z.object({
    role: z.enum(["customer", "agent", "bot"]),
    content: z.string().trim().min(1).max(1_000)
  }).strict()).max(20).optional(),
  platform: z.enum(["facebook", "instagram", "zalo", "telegram", "telegram_personal"]).optional(),
  channelId: z.string().trim().min(1).max(200).optional()
}).strict();

function authenticatedOwnerId(request: Parameters<RequestHandler>[0]): string {
  const id = (request as AuthenticatedRequest).auth?.id;
  if (!id) throw new AppError(401, "AUTHENTICATION_REQUIRED", "Authentication is required");
  return id;
}

function assistantId(request: Parameters<RequestHandler>[0]): string {
  const id = request.params.assistantId;
  if (typeof id !== "string" || !/^[0-9a-f]{24}$/i.test(id)) {
    throw new AppError(400, "INVALID_REQUEST", "Assistant id is invalid");
  }
  return id;
}

export const previewAssistant: RequestHandler = async (request, response, next) => {
  try {
    const body = previewInputSchema.safeParse(request.body);
    if (!body.success) {
      throw new AppError(400, "INVALID_REQUEST", "Assistant preview data is invalid");
    }
    response.json(await previewAssistantReply(
      authenticatedOwnerId(request),
      assistantId(request),
      body.data
    ));
  } catch (error) {
    next(error);
  }
};
