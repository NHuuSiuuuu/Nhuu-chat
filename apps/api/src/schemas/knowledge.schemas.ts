import { z } from "zod";

export const knowledgeInputSchema = z.object({
  title: z.string().refine((value) => value.trim().length > 0),
  content: z.string().refine((value) => value.trim().length > 0)
});

export const knowledgeIdSchema = z.object({
  id: z.string().min(1)
});
