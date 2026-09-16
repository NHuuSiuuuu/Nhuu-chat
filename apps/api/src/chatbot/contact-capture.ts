import type { BotConversationTurn } from "./bot-reply.provider.js";

const VIETNAMESE_PHONE_RE = /(?:\+84|0)(?:3|5|7|8|9)\d{8,9}/;
const ZALO_IDENTIFIER_RE = /\bzalo\b[\s:,-]*(?:cua|la|id|so)?[\s:,-]+[a-z0-9._-]{3,}/iu;
const CONTACT_CLAIM_RE = /(?:cam on|xin cam on).*(?:de lai|cung cap|chia se).*(?:thong tin|lien he|so dien thoai|zalo)|da (?:nhan|ghi nhan).*(?:thong tin|lien he|so dien thoai|zalo)|nhan vien.*(?:goi|nhan).*(?:zalo|dien thoai)/i;

export const CONTACT_CAPTURE_REQUEST = "Dạ Anh/Chị vui lòng chia sẻ số điện thoại hoặc Zalo để em hỗ trợ tiếp ạ.";

function containsCustomerContact(content: string): boolean {
  const compact = content.replace(/[^\d+]/g, "");
  const normalized = content
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/giu, "d");
  return VIETNAMESE_PHONE_RE.test(compact) || ZALO_IDENTIFIER_RE.test(normalized);
}

// Chỉ xác nhận đã có liên hệ từ tin khách, không tin vào nội dung bot tự tuyên bố.
export function customerContactCaptured(history: BotConversationTurn[] | undefined): boolean {
  return (history ?? [])
    .filter((turn) => turn.role === "customer")
    .some((turn) => containsCustomerContact(turn.content));
}

// Chặn câu trả lời khẳng định đã có liên hệ nếu dữ liệu khách chưa chứng minh điều đó.
export function enforceContactCapturePolicy(answer: string, captured: boolean): string {
  const normalized = answer
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/giu, "d")
    .toLocaleLowerCase("vi");
  return !captured && CONTACT_CLAIM_RE.test(normalized) ? CONTACT_CAPTURE_REQUEST : answer;
}
