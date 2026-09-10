import { z } from "zod";

export const telegramPersonalQrIdSchema = z.object({
  id: z.string().min(1)
});

export const telegramPersonalQrPasswordSchema = z.object({
  password: z.string().refine((password) => password.trim().length > 0)
});
