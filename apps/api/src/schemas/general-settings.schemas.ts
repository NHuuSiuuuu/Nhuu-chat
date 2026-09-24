import { z } from "zod";

export const generalSettingsPatchSchema = z.object({
  browserNotificationsEnabled: z.boolean().optional(),
  notificationSound: z.enum(["off", "default", "tri-tone", "clubhouse"]).optional(),
  moveUnreadConversationsToTop: z.boolean().optional(),
  openNextUnreadConversation: z.boolean().optional(),
  themeMode: z.enum(["light", "dark", "system"]).optional(),
  accentColor: z.enum(["blue", "cyan", "violet", "emerald", "rose"]).optional(),
  interfaceDensity: z.enum(["comfortable", "compact"]).optional(),
  messageFontSize: z.enum(["small", "medium", "large"]).optional()
}).strict();
