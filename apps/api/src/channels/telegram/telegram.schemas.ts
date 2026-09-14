import { z } from "zod";

const telegramUserSchema = z.object({
  id: z.number().int(),
  is_bot: z.boolean(),
  first_name: z.string().min(1),
  last_name: z.string().optional(),
  username: z.string().optional(),
  avatar_url: z.string().url().optional()
});

const telegramChatSchema = z.object({
  id: z.number().int(),
  type: z.enum(["private", "group", "supergroup", "channel"]),
  title: z.string().optional()
});

const telegramMediaSchema = z.object({
  file_id: z.string().min(1),
  file_name: z.string().optional(),
  mime_type: z.string().optional(),
  is_video: z.boolean().optional(),
  is_animated: z.boolean().optional()
});

const telegramMessageSchema = z.object({
  message_id: z.number().int(),
  date: z.number().int().nonnegative(),
  chat: telegramChatSchema,
  from: telegramUserSchema.optional(),
  text: z.string().min(1).optional(),
  caption: z.string().optional(),
  photo: z.array(telegramMediaSchema).optional(),
  document: telegramMediaSchema.optional(),
  sticker: telegramMediaSchema.optional(),
  audio: telegramMediaSchema.optional(),
  voice: telegramMediaSchema.optional(),
  video: telegramMediaSchema.optional(),
  video_note: telegramMediaSchema.optional(),
  animation: telegramMediaSchema.optional()
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
  avatarUrl?: string;
  type: "text" | "image" | "video" | "audio" | "file";
  content: string;
  sentAt: Date;
  metadata: {
    updateId: number;
    chatType: "private" | "group" | "supergroup" | "channel";
    senderName: string;
    chatTitle?: string;
    fileId?: string;
    fileName?: string;
    mimeType?: string;
  };
}
