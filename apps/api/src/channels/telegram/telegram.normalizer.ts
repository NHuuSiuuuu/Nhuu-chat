import type { NormalizedInboundMessage, TelegramUpdate } from "./telegram.schemas.js";

export function normalizeTelegramUpdate(
  update: TelegramUpdate
): NormalizedInboundMessage | null {
  const message = update.message;
  if (!message?.from || message.from.is_bot || !message.text) return null;

  const senderName = [message.from.first_name, message.from.last_name]
    .filter(Boolean)
    .join(" ");

  return {
    platform: "telegram",
    externalMessageId: String(message.message_id),
    channelId: String(message.chat.id),
    senderId: String(message.from.id),
    senderName,
    ...(message.from.username ? { senderUsername: message.from.username } : {}),
    type: "text",
    content: message.text,
    sentAt: new Date(message.date * 1_000),
    metadata: {
      updateId: update.update_id,
      chatType: message.chat.type,
      senderName,
      ...(message.chat.title ? { chatTitle: message.chat.title } : {})
    }
  };
}
