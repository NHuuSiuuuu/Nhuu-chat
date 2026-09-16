import { knowledgeEmbedding, knowledgeVectorStore } from "../ai/knowledge-runtime.js";
import { BotProcessingModel } from "../models/bot-processing.model.js";
import { ConversationModel } from "../models/conversation.model.js";
import { MessageModel } from "../models/message.model.js";
import { isBotPaused } from "../orchestration/bot-pause.service.js";
import { resolveAssistant } from "../services/assistant.service.js";
import { listAutomationTemplates } from "../services/automation-template.service.js";
import type {
  BotReplyProvider,
  BotReplyResult,
  BotConversationTurn
} from "./bot-reply.provider.js";
import type { BotDeliveryService } from "./bot-delivery.service.js";
import {
  withBotTimeout,
  type BotProcessResult,
  type NormalizedCustomerMessage
} from "./channel-bot-adapter.js";
import { matchAutomationTemplate } from "./template-matcher.js";
import { DEFAULT_GREETING_DELAY_MS, waitForGreetingDelay } from "./greeting-delay.js";
import { buildKnowledgeQuery } from "./conversation-query.js";

export type { NormalizedCustomerMessage } from "./channel-bot-adapter.js";

const defaultProvider: BotReplyProvider = {
  reply: async (input) => {
    const { GeminiBotProvider } = await import("./gemini-bot.provider.js");
    return new GeminiBotProvider().reply(input);
  }
};

// Chỉ coi lựa chọn rõ ràng của khách là yêu cầu chuyển nhân viên; fallback không tự tạo handoff.
export function customerRequestedAgent(content: string): boolean {
  return content
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim() === "gap nhan vien";
}

export class ChatbotOrchestrator {
  constructor(
    private readonly options: {
      delivery: BotDeliveryService;
      provider?: BotReplyProvider;
      now?: () => Date;
      timeoutMs?: number;
      greetingDelayMs?: number;
      waitForGreetingDelay?: (delayMs: number) => Promise<void>;
    }
  ) {}

  // Chỉ claim tin khách đã lưu và đúng owner; mọi claim đều được giữ lại khi lỗi hoặc replay.
  async process(input: NormalizedCustomerMessage): Promise<BotProcessResult> {
    if (input.senderType !== "customer") return { status: "skipped" };
    const now = this.options.now ?? (() => new Date());
    let processingId: string | undefined;
    try {
      const conversation = await ConversationModel.findOne({
        _id: input.conversationId,
        ownerId: input.ownerId,
        platform: input.platform,
        channelId: input.channelId
      }).lean();
      if (!conversation || isBotPaused(conversation.botPausedUntil, now()))
        return { status: "skipped" };
      const message = await MessageModel.findOne({
        _id: input.customerMessageId,
        conversationId: input.conversationId,
        platform: input.platform,
        senderType: "customer"
      }).lean();
      if (!message) return { status: "skipped" };
      const assistant = await resolveAssistant(input.ownerId, input.platform, input.channelId);
      const channelIdentifier = `${input.platform}:${input.channelId}`;
      if (
        !assistant ||
        !assistant.enabled ||
        (assistant.channelScope.mode === "channels" &&
          !assistant.channelScope.identifiers.includes(channelIdentifier))
      )
        return { status: "skipped" };

      await BotProcessingModel.init();
      try {
        const processing = await BotProcessingModel.create({
          ownerId: input.ownerId,
          conversationId: input.conversationId,
          customerMessageId: input.customerMessageId,
          externalMessageId: message.externalMessageId,
          assistantId: assistant.id,
          status: "processing"
        });
        processingId = String(processing._id);
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === 11000
        ) {
          return { status: "skipped" };
        }
        throw error;
      }

      let result: BotReplyResult;
      let matchedTemplate = false;
      try {
        // Cả truy xuất và provider dùng chung hạn chờ, không để claim treo vì dịch vụ bên ngoài.
        result = await withBotTimeout(async (signal) => {
          const content = message.content.trim().slice(0, 2_000);
          if (!content)
            return {
              answer: "Bạn vui lòng mô tả yêu cầu bằng văn bản để mình hỗ trợ nhé.",
              handoff: false,
              sources: []
            };
          const { templates } = await listAutomationTemplates(input.ownerId, assistant.id);
          signal.throwIfAborted();
          const template = matchAutomationTemplate({
            message: content,
            channelIdentifier,
            templates
          });
          matchedTemplate = template !== null;
          if (template && !template.allowAiRewrite)
            return {
              answer: template.responseTemplate,
              handoff: false,
              sources: []
            };
          const history = await MessageModel.find({
            conversationId: input.conversationId,
            $or: [
              { createdAt: { $lt: message.createdAt } },
              { createdAt: message.createdAt, _id: { $lt: message._id } }
            ]
          })
            .sort({ createdAt: -1, _id: -1 })
            .limit(8)
            .lean();
          signal.throwIfAborted();
          const normalizedHistory = history.reverse().map(
            (turn): BotConversationTurn => ({
              role: turn.senderType,
              content: turn.content.slice(0, 500)
            })
          );
          const knowledgeQuery = buildKnowledgeQuery(content, normalizedHistory);
          const context = template
            ? []
            : await knowledgeVectorStore.search(await knowledgeEmbedding.embed(knowledgeQuery), 5, {
                ownerId: input.ownerId,
                query: knowledgeQuery
              });
          signal.throwIfAborted();
          return (this.options.provider ?? defaultProvider).reply({
            assistant,
            message: content,
            context,
            history: normalizedHistory,
            template: template
              ? {
                  responseTemplate: template.responseTemplate,
                  allowAiRewrite: template.allowAiRewrite
                }
              : undefined
          });
        }, this.options.timeoutMs ?? 12_000);
      } catch {
        result = { answer: assistant.fallbackMessage, handoff: true, sources: [] };
      }

      if (matchedTemplate) {
        const delayMs = this.options.greetingDelayMs ?? DEFAULT_GREETING_DELAY_MS;
        if (delayMs > 0)
          await (this.options.waitForGreetingDelay ?? waitForGreetingDelay)(delayMs);
      }
      const handoff = customerRequestedAgent(input.content);
      return await this.options.delivery.deliver({
        ...input,
        processingId,
        assistantId: assistant.id,
        handoff,
        content: handoff ? assistant.fallbackMessage : result.answer
      });
    } catch {
      if (processingId) {
        await BotProcessingModel.updateOne(
          { _id: processingId, status: "processing" },
          {
            $set: { status: "failed", errorCode: "PROCESSING_FAILED" }
          }
        ).catch(() => undefined);
        await ConversationModel.updateOne(
          { _id: input.conversationId, ownerId: input.ownerId },
          {
            $set: { status: "open" }
          }
        ).catch(() => undefined);
      }
      return { status: "failed" };
    }
  }
}
