import { z } from "zod";

export const customerTagsSchema = z.object({
  tags: z.array(z.string().trim().min(1).max(50)).max(20)
});

export const customerIdSchema = z.object({
  id: z.string().min(1)
});
