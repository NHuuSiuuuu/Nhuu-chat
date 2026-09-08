import "dotenv/config";

import { z } from "zod";

const appEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]),
  PORT: z.coerce.number().int().positive().default(3000),
  MONGODB_URI: z.string().url().startsWith("mongodb"),
  REDIS_URL: z.string().url().startsWith("redis"),
  JWT_SECRET: z.string().min(32),
  ENCRYPTION_KEY: z.string().min(32),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(16)
});

export type AppEnv = z.infer<typeof appEnvSchema>;

export const env: AppEnv = appEnvSchema.parse(process.env);
