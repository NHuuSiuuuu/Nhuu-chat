import { z } from "zod";

const telegramUserSchema = z.object({
  id: z.number().int(),
  is_bot: z.boolean(),
  first_name: z.string().min(1),
  last_name: z.string().optional(),
  username: z.string().optional()
});

const telegramChatSchema = z.object({
  id: z.number().int(),
  type: z.enum(["private", "group", "supergroup", "channel"]),
  title: z.string().optional()
});

const telegramMessageSchema = z.object({
  message_id: z.number().int(),
  date: z.number().int().nonnegative(),
  chat: telegramChatSchema,
  from: telegramUserSchema.optional(),
  text: z.string().min(1).optional()
});

export const telegramUpdateSchema = z
  .object({
    update_id: z.number().int(),
    message: telegramMessageSchema.optional()
  })
  .passthrough();

export type TelegramUpdate = z.infer<typeof telegramUpdateSchema>;

export interface NormalizedInboundMessage {
  platform: "telegram";
  externalMessageId: string;
  channelId: string;
  senderId: string;
  senderName: string;
  senderUsername?: string;
  type: "text";
  content: string;
  sentAt: Date;
  metadata: {
    updateId: number;
    chatType: "private" | "group" | "supergroup" | "channel";
    chatTitle?: string;
  };
}
