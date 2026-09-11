import "dotenv/config";

import { z } from "zod";

function usesProtocol(protocols: readonly string[]) {
  return (value: string) => {
    try {
      return protocols.includes(new URL(value).protocol);
    } catch {
      return false;
    }
  };
}

const appEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  MONGODB_URI: z
    .string()
    .url()
    .refine(usesProtocol(["mongodb:", "mongodb+srv:"]), "Unsupported MongoDB protocol"),
  REDIS_URL: z
    .string()
    .url()
    .refine(usesProtocol(["redis:", "rediss:"]), "Unsupported Redis protocol"),
  JWT_SECRET: z.string().min(32),
  ENCRYPTION_KEY: z.string().min(32),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(16),
  TELEGRAM_API_ID: z.coerce.number().int().positive().optional(),
  TELEGRAM_API_HASH: z.string().min(1).optional(),
  GEMINI_API_KEY: z.string().min(1).optional(),
  // Gemini 3.5 Flash Lite is the default low-latency model for reply suggestions.
  GEMINI_CHAT_MODEL: z.string().min(1).default("gemini-3.5-flash-lite")
});

export type AppEnv = z.infer<typeof appEnvSchema>;

export const env: AppEnv = appEnvSchema.parse(process.env);
