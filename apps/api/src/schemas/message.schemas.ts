import { z } from "zod";

const optionalPositiveInteger = z.preprocess(
  (value) => typeof value === "string" ? value : undefined,
  z.string().regex(/^\d+$/).refine((value) => Number(value) >= 1).optional()
);

export const messageListQuerySchema = z.object({
  page: optionalPositiveInteger,
  limit: optionalPositiveInteger
});

export const outboundMessageSchema = z.object({
  conversationId: z.string(),
  type: z.enum(["text", "image", "file"]),
  content: z.string().default("")
});
