import { Router } from "express";

import { requireRole } from "../../auth/auth.middleware.js";
import { ingestTelegramUpdate, registerTelegramChannel } from "./telegram.service.js";

export const telegramRouter = Router();

telegramRouter.post("/webhook/:secret", async (request, response, next) => {
  try {
    if (!process.env.TELEGRAM_WEBHOOK_SECRET || request.params.secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
      response.status(401).json({ error: { code: "INVALID_WEBHOOK_SECRET", message: "Webhook secret is invalid" } });
      return;
    }

    await ingestTelegramUpdate(request.body);
    response.status(204).send();
  } catch (error) {
    next(error);
  }
});

telegramRouter.post("/", requireRole("admin"), async (request, response, next) => {
  try {
    response.status(201).json(await registerTelegramChannel(request.body));
  } catch (error) {
    next(error);
  }
});
