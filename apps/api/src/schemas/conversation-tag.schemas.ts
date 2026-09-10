import { z } from "zod";

const tagName = z.string().trim().min(1).max(80);
const tagColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "color must be a six-digit hex value");

export const conversationTagInputSchema = z.object({
  name: tagName,
  color: tagColor
});

export const conversationTagUpdateSchema = z.object({
  name: tagName.optional(),
  color: tagColor.optional()
}).refine((value) => value.name !== undefined || value.color !== undefined);

export const conversationTagIdSchema = z.object({
  id: z.string().min(1)
});
