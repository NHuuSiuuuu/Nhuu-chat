import type { AiModelTier } from "../ai/ai-settings.js";

export interface SourceRef {
  documentId: string;
  chunkIndex: number;
}

export interface BotConversationTurn {
  role: "customer" | "agent" | "bot";
  content: string;
}

export interface BotReplyContext extends SourceRef {
  content: string;
  score: number;
}

export interface BotReplyInput {
  assistant: {
    instructions: string;
    modelTier: AiModelTier;
    fallbackMessage: string;
  };
  message: string;
  history?: BotConversationTurn[];
  context?: BotReplyContext[];
  template?: {
    responseTemplate: string;
    allowAiRewrite: boolean;
  };
}

export interface BotReplyResult {
  answer: string;
  handoff: boolean;
  sources: SourceRef[];
}

export interface BotReplyProvider {
  reply(input: BotReplyInput): Promise<BotReplyResult>;
}
