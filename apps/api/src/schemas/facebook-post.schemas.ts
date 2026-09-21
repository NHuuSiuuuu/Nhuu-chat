import { z } from "zod";

const scheduledAt = z.string().trim().min(1).max(64);

export const facebookPostCreateSchema = z.object({
  message: z.string().trim().min(1).max(63206),
  mode: z.enum(["draft", "now", "scheduled"]),
  scheduledAt: scheduledAt.optional()
}).superRefine((value, context) => {
  if (value.mode === "scheduled" && !value.scheduledAt) {
    context.addIssue({ code: "custom", path: ["scheduledAt"], message: "scheduledAt is required" });
  }
  if (value.mode !== "scheduled" && value.scheduledAt) {
    context.addIssue({ code: "custom", path: ["scheduledAt"], message: "scheduledAt is only valid for scheduled posts" });
  }
});

export const facebookPostUpdateSchema = z.object({
  message: z.string().trim().min(1).max(63206).optional(),
  mode: z.enum(["draft", "scheduled"]).optional(),
  scheduledAt: scheduledAt.optional()
}).refine((value) => value.message !== undefined || value.mode !== undefined || value.scheduledAt !== undefined, {
  message: "At least one post field is required"
});

export const facebookPostListSchema = z.object({
  status: z.enum(["draft", "scheduled", "publishing", "published", "failed"]).optional()
});

export const facebookPostRetrySchema = z.object({ mode: z.enum(["now", "scheduled"]) });

export const facebookPostIdSchema = z.object({ id: z.string().trim().min(1) });

export type FacebookPostCreateInput = z.infer<typeof facebookPostCreateSchema>;
export type FacebookPostUpdateInput = z.infer<typeof facebookPostUpdateSchema>;
export type FacebookPostListInput = z.infer<typeof facebookPostListSchema>;
