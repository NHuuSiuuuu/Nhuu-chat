export type MessengerInboundEvent = {
  pageId: string;
  customerId: string;
  externalMessageId: string;
  senderId: string;
  content: string;
  attachments: { url: string; fileType: string }[];
  stickerId?: string;
  sentAt: Date;
  echo: boolean;
};

type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : null;
}

function nonempty(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function attachmentFileType(value: unknown): string {
  if (value === "image") return "image/jpeg";
  if (value === "video") return "video/mp4";
  if (value === "audio") return "audio/mpeg";
  return "application/octet-stream";
}

// Chỉ chuyển các URL HTTP(S) từ payload Messenger sang attachment nội bộ.
function normalizeAttachments(value: unknown): MessengerInboundEvent["attachments"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((attachmentValue) => {
    const attachment = record(attachmentValue);
    const payload = record(attachment?.payload);
    const url = nonempty(payload?.url);
    if (!url) return [];
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return [];
    } catch {
      return [];
    }
    return [{ url, fileType: attachmentFileType(attachment?.type) }];
  });
}

function normalizeStickerId(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

// Nhận tin Messenger có văn bản, media hoặc sticker và chỉ giữ URL HTTP(S) từ payload.
export function normalizeMessengerWebhook(payload: unknown): MessengerInboundEvent[] {
  const root = record(payload);
  if (root?.object !== "page" || !Array.isArray(root.entry)) return [];
  const normalized: MessengerInboundEvent[] = [];
  for (const entryValue of root.entry) {
    const entry = record(entryValue);
    const pageId = nonempty(entry?.id);
    if (!pageId || !Array.isArray(entry?.messaging)) continue;
    for (const eventValue of entry.messaging) {
      const event = record(eventValue);
      const message = record(event?.message);
      const sender = nonempty(record(event?.sender)?.id);
      const recipient = nonempty(record(event?.recipient)?.id);
      const mid = nonempty(message?.mid);
      const content = nonempty(message?.text);
      const attachments = normalizeAttachments(message?.attachments);
      const stickerId = normalizeStickerId(message?.sticker_id);
      if (!sender || !recipient || !mid || (!content && attachments.length === 0 && !stickerId)) continue;
      const echo = message?.is_echo === true;
      if (echo ? sender !== pageId || recipient === pageId : recipient !== pageId || sender === pageId) continue;
      const psid = echo ? recipient : sender;
      const timestamp = typeof event?.timestamp === "number" && Number.isFinite(event.timestamp) && event.timestamp > 0 && event.timestamp <= 8.64e15
        ? event.timestamp : Date.now();
      normalized.push({
        pageId,
        customerId: `facebook:${pageId}:${psid}`,
        externalMessageId: `facebook:${pageId}:${mid}`,
        senderId: sender,
        content: content ?? "",
        attachments,
        ...(stickerId ? { stickerId } : {}),
        sentAt: new Date(timestamp),
        echo
      });
    }
  }
  return normalized;
}
