import { z } from "zod";

const optionalScalarString = z.preprocess(
  (value) => typeof value === "string" ? value : undefined,
  z.string().optional()
);

const optionalPositiveInteger = z.preprocess(
  (value) => typeof value === "string" ? value : undefined,
  z.string().regex(/^\d+$/).refine((value) => Number(value) >= 1).optional()
);

export const conversationListQuerySchema = z.object({
  page: optionalPositiveInteger,
  limit: optionalPositiveInteger,
  platform: optionalScalarString,
  channelId: optionalScalarString,
  status: optionalScalarString
});

export const conversationIdSchema = z.object({
  id: z.preprocess(
    (value) => Array.isArray(value) ? value[0] : value,
    z.string().min(1)
  )
});

export const conversationAssignmentSchema = z.object({
  assignedAgentId: z.string().nullable()
});

export const conversationBotSchema = z.object({
  botEnabled: z.boolean()
});

export const conversationStatusSchema = z.object({
  status: z.enum(["open", "pending", "closed"])
});

export const conversationTagsSchema = z.object({
  tagIds: z.array(z.string().min(1)).max(50)
});

export const conversationBulkActionSchema = z.object({
  action: z.enum(["read", "unread", "delete"]),
  conversationIds: z.array(z.string().regex(/^[a-f\d]{24}$/i)).min(1).max(100)
    .refine((ids) => new Set(ids).size === ids.length)
});

export const aiSuggestionRequestSchema = z.object({
  trigger: z.enum(["manual", "conversation_open", "customer_message"]).default("manual")
}).default({ trigger: "manual" });
