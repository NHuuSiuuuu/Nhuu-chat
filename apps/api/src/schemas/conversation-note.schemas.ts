import { z } from "zod";

export const conversationNoteContentSchema = z.object({ content: z.string().trim().min(1).max(2000) });
export const conversationNotePinSchema = z.object({ isPinned: z.boolean() });
