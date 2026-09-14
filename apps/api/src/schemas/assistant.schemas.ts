import { z } from "zod";

const fallbackMessage = "Mình sẽ chuyển bạn đến nhân viên hỗ trợ nhé.";
const channelScopeSchema = z.object({
  mode: z.enum(["all", "channels"]),
  identifiers: z.array(z.string().trim().min(1)).default([])
}).strict();

const assistantFields = {
  name: z.string().trim().min(1).max(100),
  instructions: z.string().trim().min(1).max(4000),
  modelTier: z.enum(["smart", "balanced", "economy"]),
  enabled: z.boolean(),
  fallbackMessage: z.string().trim().min(1).max(500),
  channelScope: channelScopeSchema,
  isDefault: z.boolean()
};

export const assistantCreateSchema = z.object({
  ...assistantFields,
  modelTier: assistantFields.modelTier.default("smart"),
  enabled: assistantFields.enabled.default(true),
  fallbackMessage: assistantFields.fallbackMessage.default(fallbackMessage),
  channelScope: assistantFields.channelScope.default({ mode: "all", identifiers: [] }),
  isDefault: assistantFields.isDefault.default(false)
}).strict();

export const assistantPatchSchema = z.object(assistantFields).partial().strict();
