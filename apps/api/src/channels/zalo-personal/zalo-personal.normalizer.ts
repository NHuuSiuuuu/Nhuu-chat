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
  if (event.type !== 0 && event.type !== 1) return null;
  const data = event.data;
  const externalMessageId = stringValue(data.msgId) ?? stringValue(data.cliMsgId);
  const channelId = stringValue(event.threadId);
  const senderId = stringValue(data.uidFrom);
  const content = typeof data.content === "string" ? data.content : "";
  if (!externalMessageId || !channelId || !senderId || (!content && !hasMedia(data))) return null;

  const isSelf = senderId === accountId;
  const chatType = event.type === 1 ? "group" : "private";
  const type = classifyMessage(data);
  const sentAt = parseTimestamp(data.ts);
  if (!sentAt) return null;
  const media = safeMediaMetadata(data.propertyExt);

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
    metadata: { messageType: data.msgType, ...(media ? { media } : {}) }
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

const SENSITIVE_METADATA_KEY = /token|secret|credential|cookie|authorization|password|session|imei|useragent|api[_-]?key|signature/i;
const SENSITIVE_METADATA_VALUE = /(?:token|secret|credential|cookie|authorization|password|session|api[_-]?key|signature)=/i;

// Chỉ giữ metadata media là plain object và loại bỏ trường nhạy cảm trước khi lưu payload từ thư viện native.
function safeMediaMetadata(value: unknown): Record<string, unknown> | undefined {
  if (!isPlainRecord(value)) return undefined;
  const metadata = safePlainRecord(value);
  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function safePlainRecord(value: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (SENSITIVE_METADATA_KEY.test(key)) continue;
    if (typeof entry === "string") {
      if (!SENSITIVE_METADATA_VALUE.test(entry)) safe[key] = entry;
    } else if (typeof entry === "number" || typeof entry === "boolean" || entry === null) {
      safe[key] = entry;
    } else if (isPlainRecord(entry)) {
      const nested = safePlainRecord(entry);
      if (Object.keys(nested).length > 0) safe[key] = nested;
    }
  }
  return safe;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
