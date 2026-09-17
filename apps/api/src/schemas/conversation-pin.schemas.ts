import { z } from "zod";

export const conversationPinMessageSchema = z.object({ messageId: z.string().trim().min(1) });
export const conversationPinMessageIdSchema = z.object({ messageId: z.string().trim().min(1) });
