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
  "muon",
  "sv"
]);

const SHORT_REPLY_EXPANSIONS = new Map([
  ["sv", "sinh viên"]
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

function expandShortReply(message: string): string {
  return SHORT_REPLY_EXPANSIONS.get(normalizeReply(message)) ?? message;
}

// Giữ câu trả lời ngay trước đó khi khách xác nhận để truy xuất tiếp đúng chủ đề đang tư vấn.
export function buildKnowledgeQuery(message: string, history: BotConversationTurn[] | undefined): string {
  const isContactMessage = customerContactCaptured([{ role: "customer", content: message }]);
  if (!isContinuationReply(message) && !isContactMessage) return message;
  const turns = [...(history ?? [])];
  const previousAnswer = [...turns]
    .reverse()
    .find((turn) => turn.role === "bot" || turn.role === "agent")?.content.trim();
  const previousCustomerMessage = [...turns]
    .reverse()
    .find((turn) => turn.role === "customer")?.content.trim();
  return [previousCustomerMessage, previousAnswer, expandShortReply(message)]
    .filter((part): part is string => Boolean(part))
    .join("\n");
}
