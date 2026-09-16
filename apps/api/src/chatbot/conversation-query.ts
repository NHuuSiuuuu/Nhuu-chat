import type { BotConversationTurn } from "./bot-reply.provider.js";
import { customerContactCaptured } from "./contact-capture.js";

const CONTINUATION_REPLIES = new Set([
  "co",
  "duoc",
  "vang",
  "ok",
  "okay",
  "yes",
  "dong y",
  "dung",
  "muon"
]);

function normalizeReply(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/giu, "d")
    .toLocaleLowerCase("vi")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function isContinuationReply(message: string): boolean {
  return CONTINUATION_REPLIES.has(normalizeReply(message));
}

// Giữ câu trả lời ngay trước đó khi khách xác nhận để truy xuất tiếp đúng chủ đề đang tư vấn.
export function buildKnowledgeQuery(message: string, history: BotConversationTurn[] | undefined): string {
  const isContactMessage = customerContactCaptured([{ role: "customer", content: message }]);
  if (!isContinuationReply(message) && !isContactMessage) return message;
  const previousAnswer = [...(history ?? [])]
    .reverse()
    .find((turn) => turn.role === "bot" || turn.role === "agent")?.content.trim();
  return previousAnswer ? `${previousAnswer}\n${message}` : message;
}
