import type { AutomationTemplateContract, BotPreviewResponse } from "@nhuu-chat/contracts";

import { DeterministicEmbeddingProvider } from "../ai/embedding.provider.js";
import { InMemoryVectorStore } from "../ai/vector.store.js";
import type { BotConversationTurn, BotReplyContext } from "./bot-reply.provider.js";
import { matchAutomationTemplate } from "./template-matcher.js";
import { AppError } from "../common/errors.js";
import { AssistantModel } from "../models/assistant.model.js";
import { AutomationTemplateModel } from "../models/automation-template.model.js";
import { KnowledgeChunkModel } from "../models/knowledge.model.js";

const MAX_KNOWLEDGE_CANDIDATES = 50;
const MAX_CONTEXT_CHUNKS = 5;

export interface AssistantPreviewInput {
  message: string;
  history?: BotConversationTurn[];
  platform?: string;
  channelId?: string;
}

interface AssistantRow {
  instructions: string;
  modelTier: "smart" | "balanced" | "economy";
  fallbackMessage: string;
}

interface KnowledgeChunkRow {
  ownerId: unknown;
  documentId: unknown;
  chunkIndex: number;
  content: string;
  embedding: number[];
}

// Đọc hữu hạn các chunk đúng owner rồi xếp hạng bằng vector store hiện có.
async function retrieveContext(ownerId: string, message: string): Promise<BotReplyContext[]> {
  const rows = await KnowledgeChunkModel.find({ ownerId })
    .limit(MAX_KNOWLEDGE_CANDIDATES)
    .lean();
  if (rows.length === 0) return [];

  const embedding = new DeterministicEmbeddingProvider();
  const store = new InMemoryVectorStore();
  await store.upsert((rows as unknown as KnowledgeChunkRow[]).map((row) => ({
    ownerId: String(row.ownerId),
    documentId: String(row.documentId),
    chunkIndex: row.chunkIndex,
    content: row.content,
    embedding: row.embedding
  })));
  return store.search(
    await embedding.embed(message),
    MAX_CONTEXT_CHUNKS,
    { ownerId }
  );
}

// Preview chỉ đọc cấu hình/knowledge và không tạo message, processing hay delivery job.
export async function previewAssistantReply(
  ownerId: string,
  assistantId: string,
  input: AssistantPreviewInput
): Promise<BotPreviewResponse> {
  const assistant = await AssistantModel.findOne({ _id: assistantId, ownerId }).lean();
  if (!assistant) {
    throw new AppError(404, "ASSISTANT_NOT_FOUND", "Assistant was not found");
  }

  const templates = await AutomationTemplateModel.find({ ownerId, assistantId, enabled: true })
    .sort({ priority: -1, createdAt: 1, _id: 1 })
    .lean();
  const channelIdentifier = input.platform && input.channelId
    ? `${input.platform}:${input.channelId}`
    : "preview:preview";
  const template = matchAutomationTemplate({
    message: input.message,
    channelIdentifier,
    templates: templates as unknown as AutomationTemplateContract[]
  });
  const context = template ? [] : await retrieveContext(ownerId, input.message);
  const assistantInput = assistant as unknown as AssistantRow;

  try {
    const { GeminiBotProvider } = await import("./gemini-bot.provider.js");
    const result = await new GeminiBotProvider().reply({
      assistant: {
        instructions: assistantInput.instructions,
        modelTier: assistantInput.modelTier,
        fallbackMessage: assistantInput.fallbackMessage
      },
      message: input.message,
      history: input.history,
      context,
      template: template ? {
        responseTemplate: template.responseTemplate,
        allowAiRewrite: template.allowAiRewrite
      } : undefined
    });

    return {
      answer: result.answer,
      source: result.handoff ? "fallback" : template ? "template" : "ai",
      handoff: result.handoff
    };
  } catch {
    return {
      answer: assistantInput.fallbackMessage,
      source: "fallback",
      handoff: true
    };
  }
}
