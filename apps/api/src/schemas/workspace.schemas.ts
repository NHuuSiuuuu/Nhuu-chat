import { z } from "zod";

const allowedPagesSchema = z.array(z.string().trim().min(1).max(255)).max(100).transform((values) => [...new Set(values)]);

export const workspaceMemberSchema = z.object({
  email: z.string().trim().email().max(320),
  role: z.enum(["admin", "staff"]),
  allowedPages: allowedPagesSchema.default([])
});

export const workspaceMemberPatchSchema = z.object({
  role: z.enum(["admin", "staff"]).optional(),
  allowedPages: allowedPagesSchema.optional()
}).refine((value) => Object.keys(value).length > 0);

export function isMongoId(value: string): boolean {
  return /^[0-9a-f]{24}$/i.test(value);
}
