export type MessengerTextEvent = {
  pageId: string;
  customerId: string;
  externalMessageId: string;
  senderId: string;
  content: string;
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

// Chỉ nhận văn bản Messenger có Page và PSID hợp lệ; bỏ qua loại sự kiện ngoài MVP.
export function normalizeMessengerWebhook(payload: unknown): MessengerTextEvent[] {
  const root = record(payload);
  if (root?.object !== "page" || !Array.isArray(root.entry)) return [];
  const normalized: MessengerTextEvent[] = [];
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
      if (!sender || !recipient || !mid || !content || Array.isArray(message?.attachments)) continue;
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
        content,
        sentAt: new Date(timestamp),
        echo
      });
    }
  }
  return normalized;
}
