import type { RequestHandler } from "express";

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

    // Baseline Zod failures use the existing generic error response.
    const update = telegramWebhookUpdateSchema.parse(request.body);

    await ingestTelegramUpdate(update);
    response.status(204).send();
  } catch (error) {
    next(error);
  }
};

export const registerChannel: RequestHandler = async (request, response, next) => {
  try {
    const input = telegramChannelConfigSchema.parse(request.body);

    response.status(201).json(await registerTelegramChannel(input));
  } catch (error) {
    next(error);
  }
};
