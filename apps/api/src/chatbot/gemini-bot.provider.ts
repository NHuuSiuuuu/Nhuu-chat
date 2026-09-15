import { GoogleGenAI, Type } from "@google/genai";
import { env } from "@nhuu-chat/config";

import { modelTierToGeminiModel } from "../ai/ai-settings.js";
import type {
  BotConversationTurn,
  BotReplyContext,
  BotReplyInput,
  BotReplyProvider,
  BotReplyResult
} from "./bot-reply.provider.js";

const REQUEST_TIMEOUT_MS = 10_000;
const MIN_CONTEXT_SCORE = 0.35;
const MAX_INSTRUCTION_LENGTH = 4_000;
const MAX_MESSAGE_LENGTH = 2_000;
const MAX_HISTORY_TURNS = 8;
const MAX_HISTORY_TURN_LENGTH = 500;
const MAX_CONTEXT_CHUNKS = 5;
const MAX_CONTEXT_CHUNK_LENGTH = 1_000;
const MAX_PROMPT_LENGTH = 15_000;
const MAX_ANSWER_LENGTH = 2_000;

interface GeminiReplyPayload {
  answer: unknown;
  grounded: unknown;
  handoff: unknown;
}

function fallback(input: BotReplyInput): BotReplyResult {
  return { answer: input.assistant.fallbackMessage, handoff: true, sources: [] };
}

function exactTemplate(input: BotReplyInput): BotReplyResult {
  return { answer: input.template?.responseTemplate ?? input.assistant.fallbackMessage, handoff: false, sources: [] };
}

function clipped(value: string, limit: number): string {
  return value.trim().slice(0, limit);
}

function boundedHistory(history: BotConversationTurn[] | undefined): string {
  return (history ?? [])
    .slice(-MAX_HISTORY_TURNS)
    .map((turn) => `${turn.role}: ${clipped(turn.content, MAX_HISTORY_TURN_LENGTH)}`)
    .join("\n");
}

function strongContext(context: BotReplyContext[] | undefined): BotReplyContext[] {
  return (context ?? [])
    .filter((chunk) => chunk.score >= MIN_CONTEXT_SCORE)
    .slice(0, MAX_CONTEXT_CHUNKS);
}

// Tạo prompt hữu hạn, ưu tiên dữ liệu cửa hàng và cho phép kiến thức chung theo instructions.
function buildPrompt(input: BotReplyInput, context: BotReplyContext[]): string {
  const history = boundedHistory(input.history) || "(không có)";
  const knowledge = context.length === 0
    ? "(không có)"
    : context.map((chunk, index) =>
      `[${index + 1}] ${clipped(chunk.content, MAX_CONTEXT_CHUNK_LENGTH)}`
    ).join("\n");
  const task = input.template
    ? `Viết lại mẫu sau bằng tiếng Việt tự nhiên nhưng không thay đổi ý nghĩa, số liệu, chính sách hoặc cam kết. Nếu không thể giữ nguyên ý nghĩa, đặt grounded=false.\n\nMẫu bắt buộc giữ nghĩa:\n${clipped(input.template.responseTemplate, MAX_ANSWER_LENGTH)}`
    : context.length > 0
      ? "Trả lời câu hỏi bằng tiếng Việt. Chỉ sử dụng ngữ cảnh kiến thức được cung cấp cho thông tin cửa hàng. Nếu ngữ cảnh không đủ để trả lời chắc chắn, đặt grounded=false và handoff=true."
      : "Trả lời câu hỏi bằng tiếng Việt dựa trên Hướng dẫn trợ lý và kiến thức chung phù hợp. Không tự bịa thông tin riêng của cửa hàng; nếu câu hỏi cần dữ liệu cửa hàng mà không có ngữ cảnh, đặt grounded=false và handoff=true.";

  return [
    task,
    `Hướng dẫn trợ lý:\n${clipped(input.assistant.instructions, MAX_INSTRUCTION_LENGTH)}`,
    `Tin nhắn hiện tại:\n${clipped(input.message, MAX_MESSAGE_LENGTH)}`,
    `Lịch sử gần nhất (cũ đến mới):\n${history}`,
    `Ngữ cảnh kiến thức:\n${knowledge}`,
    "Chỉ trả JSON theo schema. Không thêm thông tin ngoài nguồn."
  ].join("\n\n").slice(0, MAX_PROMPT_LENGTH);
}

function parsePayload(responseText: unknown): GeminiReplyPayload | null {
  if (typeof responseText !== "string") return null;
  try {
    const payload: unknown = JSON.parse(responseText);
    if (typeof payload !== "object" || payload === null) return null;
    if (!("answer" in payload) || !("grounded" in payload) || !("handoff" in payload)) return null;
    return payload as GeminiReplyPayload;
  } catch {
    return null;
  }
}

export class GeminiBotProvider implements BotReplyProvider {
  private readonly client: GoogleGenAI | null;

  constructor() {
    this.client = env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: env.GEMINI_API_KEY }) : null;
  }

  // Trả nguyên mẫu an toàn hoặc tạo câu trả lời có căn cứ trong thời gian hữu hạn.
  async reply(input: BotReplyInput): Promise<BotReplyResult> {
    if (input.template && !input.template.allowAiRewrite) return exactTemplate(input);

    const context = strongContext(input.context);
    // Context yếu vẫn phải fallback để không đoán dữ liệu cửa hàng; context rỗng được dùng kiến thức chung.
    if (!input.template && (input.context?.length ?? 0) > 0 && context.length === 0) return fallback(input);
    if (!this.client) return input.template ? exactTemplate(input) : fallback(input);

    const abortController = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    try {
      const timeout = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          abortController.abort();
          reject(new Error("Gemini request timed out"));
        }, REQUEST_TIMEOUT_MS);
      });
      const request = (model: string) => this.client!.models.generateContent({
        model,
        contents: buildPrompt(input, context),
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              answer: { type: Type.STRING },
              grounded: { type: Type.BOOLEAN },
              handoff: { type: Type.BOOLEAN }
            },
            required: ["answer", "grounded", "handoff"]
          },
          abortSignal: abortController.signal,
          httpOptions: { timeout: REQUEST_TIMEOUT_MS }
        }
      });
      const primaryModel = modelTierToGeminiModel(input.assistant.modelTier);
      const fallbackModel = env.GEMINI_CHAT_MODEL;
      // Nếu model theo tier hết quota, thử model chat đã cấu hình trong cùng thời hạn.
      let response;
      try {
        response = await Promise.race([request(primaryModel), timeout]);
      } catch (error) {
        if (primaryModel === fallbackModel || abortController.signal.aborted) throw error;
        response = await Promise.race([request(fallbackModel), timeout]);
      }
      const payload = parsePayload(response.text);
      const answer = typeof payload?.answer === "string"
        ? clipped(payload.answer, MAX_ANSWER_LENGTH)
        : "";

      if (!payload || payload.grounded !== true || payload.handoff !== false || !answer) {
        return input.template ? exactTemplate(input) : fallback(input);
      }

      return {
        answer,
        handoff: false,
        sources: input.template
          ? []
          : context.map(({ documentId, chunkIndex }) => ({ documentId, chunkIndex }))
      };
    } catch {
      return input.template ? exactTemplate(input) : fallback(input);
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    }
  }
}
