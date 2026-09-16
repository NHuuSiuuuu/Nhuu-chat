import type { AutomationTemplateContract, BotPreviewResponse } from "@nhuu-chat/contracts";

import { knowledgeEmbedding, knowledgeVectorStore } from "../ai/knowledge-runtime.js";
import type { BotConversationTurn, BotReplyContext } from "./bot-reply.provider.js";
import { buildKnowledgeQuery } from "./conversation-query.js";
import { matchAutomationTemplate } from "./template-matcher.js";
import { AppError } from "../common/errors.js";
import { AssistantModel } from "../models/assistant.model.js";
import { AutomationTemplateModel } from "../models/automation-template.model.js";

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

// Tìm trên toàn bộ index đúng owner rồi chỉ lấy năm chunk xếp hạng cao nhất.
async function retrieveContext(
  ownerId: string,
  message: string,
  history: BotConversationTurn[] | undefined
): Promise<BotReplyContext[]> {
  const query = buildKnowledgeQuery(message, history);
  return knowledgeVectorStore.search(
    await knowledgeEmbedding.embed(query),
    MAX_CONTEXT_CHUNKS,
    { ownerId, query }
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
  const context = template ? [] : await retrieveContext(ownerId, input.message, input.history);
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
