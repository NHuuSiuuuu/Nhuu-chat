import { z } from "zod";

export const facebookPageConnectionSchema = z.object({
  pageId: z.string().trim().min(1).max(255),
  pageAccessToken: z.string().min(1)
});

export type FacebookPageConnectionInput = z.infer<typeof facebookPageConnectionSchema>;
