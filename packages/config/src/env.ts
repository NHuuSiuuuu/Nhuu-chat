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

const optionalCloudinaryEnv = z.preprocess(
  (value) => value === "" ? undefined : value,
  z.string().min(1).optional()
);

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
  WEB_ALLOWED_ORIGINS: z.string().default("http://localhost:5173"),
  AUTH_COOKIE_SAME_SITE: z.enum(["lax", "strict", "none"]).optional(),
  TELEGRAM_API_ID: z.coerce.number().int().positive().optional(),
  TELEGRAM_API_HASH: z.string().min(1).optional(),
  GEMINI_API_KEY: z.string().min(1).optional(),
  CLOUDINARY_CLOUD_NAME: optionalCloudinaryEnv,
  CLOUDINARY_API_KEY: optionalCloudinaryEnv,
  CLOUDINARY_API_SECRET: optionalCloudinaryEnv,
  // Gemini 3.5 Flash Lite is the default low-latency model for reply suggestions.
  GEMINI_CHAT_MODEL: z.string().min(1).default("gemini-3.5-flash-lite"),
  META_GRAPH_API_VERSION: z.string().min(1).default("v26.0"),
  FACEBOOK_POST_SCHEDULER_INTERVAL_MS: z.coerce.number().int().positive().default(30_000),
  FACEBOOK_POST_LEASE_MS: z.coerce.number().int().positive().default(120_000)
});

export type AppEnv = z.infer<typeof appEnvSchema>;

export const env: AppEnv = appEnvSchema.parse(process.env);
