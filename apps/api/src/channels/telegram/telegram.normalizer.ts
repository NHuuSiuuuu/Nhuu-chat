import type { NormalizedInboundMessage, TelegramUpdate } from "./telegram.schemas.js";

// Giữ caption và tham chiếu ảnh để bot đọc văn bản mà không suy đoán nội dung media.
export function normalizeTelegramUpdate(
  update: TelegramUpdate
): NormalizedInboundMessage | null {
  const message = update.message;
  if (!message?.from || message.from.is_bot) return null;
  const photo = message.photo?.at(-1);
  if (!message.text && !photo) return null;

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
    ...(message.from.avatar_url ? { avatarUrl: message.from.avatar_url } : {}),
    type: photo ? "image" : "text",
    content: message.text ?? message.caption ?? "",
    sentAt: new Date(message.date * 1_000),
    metadata: {
      updateId: update.update_id,
      chatType: message.chat.type,
      senderName,
      ...(photo ? { fileId: photo.file_id } : {}),
      ...(message.chat.title ? { chatTitle: message.chat.title } : {})
    }
  };
}
