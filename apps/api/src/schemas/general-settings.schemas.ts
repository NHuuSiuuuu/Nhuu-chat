import { z } from "zod";

export const generalSettingsPatchSchema = z.object({
  browserNotificationsEnabled: z.boolean().optional(),
  notificationSound: z.enum(["off", "default", "tri-tone", "clubhouse"]).optional(),
  moveUnreadConversationsToTop: z.boolean().optional(),
  openNextUnreadConversation: z.boolean().optional()
}).strict();
