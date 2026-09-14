import { z } from "zod";

const shortcutSchema = z.string().trim().min(1);
const messageSchema = z.string().trim().min(1);

export const quickReplyCreateSchema = z.object({
  shortcut: shortcutSchema,
  message: messageSchema
});

export const quickReplyUpdateSchema = z.object({
  shortcut: shortcutSchema.optional(),
  message: messageSchema.optional()
});

export const quickReplyIdSchema = z.object({
  id: z.string().regex(/^[0-9a-f]{24}$/i)
});
