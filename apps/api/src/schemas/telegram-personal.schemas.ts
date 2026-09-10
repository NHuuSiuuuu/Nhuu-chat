import { z } from "zod";

export const telegramPersonalQrIdSchema = z.object({
  id: z.preprocess((value) => Array.isArray(value) ? value[0] : value, z.string().min(1))
});

export const telegramPersonalQrPasswordSchema = z.object({
  password: z.string().refine((password) => password.trim().length > 0)
});
