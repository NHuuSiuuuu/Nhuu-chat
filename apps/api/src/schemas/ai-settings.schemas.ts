import { z } from "zod";

export const aiSettingsPatchSchema = z.object({
  modelTier: z.enum(["smart", "balanced", "economy"]).optional(),
  enabled: z.boolean().optional(),
  suggestionsEnabled: z.boolean().optional(),
  sentimentEnabled: z.boolean().optional(),
  suggestionMode: z.enum(["off", "manual", "on_open", "on_customer_message"]).optional(),
  sentimentWindow: z.union([z.literal(3), z.literal(6), z.literal(10)]).optional()
}).strict();
