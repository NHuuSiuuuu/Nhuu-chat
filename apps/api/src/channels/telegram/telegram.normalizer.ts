import type { NormalizedInboundMessage, TelegramUpdate } from "./telegram.schemas.js";

// Giữ caption và tham chiếu media để bot đọc văn bản mà không suy đoán nội dung tệp.
export function normalizeTelegramUpdate(
  update: TelegramUpdate
): NormalizedInboundMessage | null {
  const message = update.message;
  if (!message?.from || message.from.is_bot) return null;
  const photo = message.photo?.at(-1);
  const media = photo ?? message.sticker ?? message.video ?? message.video_note ?? message.animation ?? message.audio ?? message.voice ?? message.document;
  const type = photo ? "image" : message.sticker ? (message.sticker.is_video || message.sticker.is_animated ? "video" : "image")
    : message.video || message.video_note || message.animation ? "video"
    : message.audio || message.voice ? "audio" : message.document ? "file" : "text";
  if (!message.text && !media) return null;

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
    type,
    content: message.text ?? message.caption ?? "",
    sentAt: new Date(message.date * 1_000),
    metadata: {
      updateId: update.update_id,
      chatType: message.chat.type,
      senderName,
      ...(media ? { fileId: media.file_id, ...(media.file_name ? { fileName: media.file_name } : {}), ...(media.mime_type ? { mimeType: media.mime_type } : {}) } : {}),
      ...(message.chat.title ? { chatTitle: message.chat.title } : {})
    }
  };
}
