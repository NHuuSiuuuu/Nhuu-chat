import { Router } from "express";

import { requireRole } from "../../auth/auth.middleware.js";
import { ingestWebhook, registerChannel } from "../../controllers/telegram.controller.js";

export const telegramRouter = Router();

telegramRouter.post("/webhook/:secret", ingestWebhook);
telegramRouter.post("/", requireRole("admin"), registerChannel);
