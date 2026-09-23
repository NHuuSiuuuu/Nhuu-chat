import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().min(1),
  password: z.string().min(8)
});

export const loginSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1)
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email()
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8)
});
