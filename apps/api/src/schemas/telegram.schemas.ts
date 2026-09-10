import { z } from "zod";

import { telegramUpdateSchema } from "../channels/telegram/telegram.schemas.js";

export const telegramWebhookUpdateSchema = telegramUpdateSchema;

export const telegramChannelConfigSchema = z.object({
  botToken: z.string().trim().min(1),
  webhookBaseUrl: z.string().url()
});
