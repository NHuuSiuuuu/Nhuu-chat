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
  const attachment = isPlainRecord(data.content) ? data.content : undefined;
  const content = typeof data.content === "string" ? data.content : attachmentCaption(attachment);
  if (!externalMessageId || !channelId || !senderId || (!content && !hasMedia(data))) return null;

  const isSelf = senderId === accountId;
  const chatType = event.type === 1 ? "group" : "private";
  const type = classifyMessage(data);
  const sentAt = parseTimestamp(data.ts);
  if (!sentAt) return null;
  const media = safeMediaMetadata(data.propertyExt, attachment);

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

// Lấy title trước description vì đây là hai trường text mà zca-js công bố cho attachment content.
function attachmentCaption(attachment: Record<string, unknown> | undefined): string {
  if (!attachment) return "";
  return stringValue(attachment.title) ?? stringValue(attachment.description) ?? "";
}

// Gộp metadata định dạng và attachment thật, đồng thời lọc dữ liệu nhạy cảm trước khi persistence.
function safeMediaMetadata(propertyExt: unknown, attachment: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  const metadata = isPlainRecord(propertyExt) ? safePlainRecord(propertyExt) : {};
  if (attachment) Object.assign(metadata, safeAttachmentMetadata(attachment));
  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

// Params của zca-js là JSON string nên chỉ giữ object đã parse và sanitize, không lưu nguyên chuỗi opaque.
function safeAttachmentMetadata(attachment: Record<string, unknown>): Record<string, unknown> {
  const metadata = safePlainRecord(attachment);
  delete metadata.params;
  if (typeof attachment.params !== "string") return metadata;

  try {
    const params = JSON.parse(attachment.params) as unknown;
    if (isPlainRecord(params)) {
      const safeParams = safePlainRecord(params);
      if (Object.keys(safeParams).length > 0) metadata.params = safeParams;
    }
  } catch {
    // Params không phải JSON hợp lệ không đủ an toàn để lưu lại.
  }
  return metadata;
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
