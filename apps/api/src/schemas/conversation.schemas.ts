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

export const conversationStatusSchema = z.object({
  status: z.enum(["open", "pending", "closed"])
});

export const conversationTagsSchema = z.object({
  tagIds: z.array(z.string().min(1)).max(50)
});
