import type { RequestHandler } from "express";

import { AppError } from "../common/errors.js";
import {
  telegramChannelConfigSchema,
  telegramWebhookUpdateSchema
} from "../schemas/telegram.schemas.js";
import {
  ingestTelegramUpdate,
  registerTelegramChannel
} from "../services/telegram.service.js";

export const ingestWebhook: RequestHandler = async (request, response, next) => {
  try {
    if (
      !process.env.TELEGRAM_WEBHOOK_SECRET ||
      request.params.secret !== process.env.TELEGRAM_WEBHOOK_SECRET
    ) {
      response.status(401).json({
        error: { code: "INVALID_WEBHOOK_SECRET", message: "Webhook secret is invalid" }
      });
      return;
    }

    const update = telegramWebhookUpdateSchema.safeParse(request.body);
    if (!update.success) {
      throw new AppError(400, "INVALID_REQUEST", "Telegram update is invalid");
    }

    await ingestTelegramUpdate(update.data);
    response.status(204).send();
  } catch (error) {
    next(error);
  }
};

export const registerChannel: RequestHandler = async (request, response, next) => {
  try {
    const input = telegramChannelConfigSchema.safeParse(request.body);
    if (!input.success) {
      throw new AppError(
        400,
        "INVALID_REQUEST",
        "Bot token and a valid webhook base URL are required"
      );
    }

    response.status(201).json(await registerTelegramChannel(input.data));
  } catch (error) {
    next(error);
  }
};
