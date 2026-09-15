export interface NormalizedZaloPersonalMessage {
  platform: "zalo_personal";
  externalMessageId: string;
  channelId: string;
  senderId: string;
  senderName: string;
  avatarUrl?: string;
  type: "text" | "image" | "video" | "audio" | "file";
  content: string;
  sentAt: Date;
  chatType: "private" | "group";
  isSelf: boolean;
  metadata: Record<string, unknown>;
}

// Chuẩn hóa payload zca-js về contract inbound và loại bỏ event thiếu định danh tối thiểu.
export function normalizeZaloPersonalMessage(event: unknown, accountId: string): NormalizedZaloPersonalMessage | null {
  if (!isRecord(event) || !isRecord(event.data)) return null;
  const data = event.data;
  const externalMessageId = stringValue(data.msgId) ?? stringValue(data.cliMsgId);
  const channelId = stringValue(event.threadId);
  const senderId = stringValue(data.uidFrom);
  const content = typeof data.content === "string" ? data.content : "";
  if (!externalMessageId || !channelId || !senderId || (!content && !hasMedia(data))) return null;

  const isSelf = event.isSelf === true || senderId === accountId && event.isSelf !== false;
  const chatType = event.type === 1 ? "group" : "private";
  const type = classifyMessage(data);
  const sentAt = parseTimestamp(data.ts);
  if (!sentAt) return null;

  return {
    platform: "zalo_personal",
    externalMessageId,
    channelId,
    senderId,
    senderName: stringValue(data.dName) ?? "",
    ...(stringValue(data.avatar) ? { avatarUrl: stringValue(data.avatar) } : {}),
    type,
    content,
    sentAt,
    chatType,
    isSelf,
    metadata: { messageType: data.msgType }
  };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : typeof value === "number" ? String(value) : undefined;
}

// Nhận diện media theo msgType/propertyExt nhưng vẫn giữ caption text nếu Zalo gửi kèm.
function classifyMessage(data: Record<string, unknown>): NormalizedZaloPersonalMessage["type"] {
  const msgType = String(data.msgType ?? "").toLowerCase();
  const extension = JSON.stringify(data.propertyExt ?? "").toLowerCase();
  if (msgType.includes("image") || msgType.includes("photo") || extension.includes("image")) return "image";
  if (msgType.includes("video") || extension.includes("video")) return "video";
  if (msgType.includes("audio") || msgType.includes("voice") || extension.includes("audio")) return "audio";
  if (msgType.includes("file") || msgType.includes("document") || extension.includes("file")) return "file";
  return "text";
}

function hasMedia(data: Record<string, unknown>): boolean {
  return classifyMessage(data) !== "text" || isRecord(data.content);
}

function parseTimestamp(value: unknown): Date | null {
  const timestamp = typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isFinite(timestamp)) return null;
  const milliseconds = timestamp < 10_000_000_000 ? timestamp * 1_000 : timestamp;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
