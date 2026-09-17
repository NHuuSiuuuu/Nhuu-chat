export interface HealthResponse {
  status: "ok";
  service: "nhuu-chat";
}

export interface AiSuggestionsResponse {
  suggestions: string[];
  source: "gemini" | "fallback";
}

export type AiModelTier = "smart" | "balanced" | "economy";
export type AiSuggestionMode = "off" | "manual" | "on_open" | "on_customer_message";
export type AiSentimentWindow = 3 | 6 | 10;

export interface ChannelScopeContract {
  mode: "all" | "channels";
  identifiers: string[];
}

export interface AssistantContract {
  id: string;
  ownerId: string;
  name: string;
  instructions: string;
  modelTier: AiModelTier;
  enabled: boolean;
  fallbackMessage: string;
  channelScope: ChannelScopeContract;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationTemplateContract {
  id: string;
  ownerId: string;
  assistantId: string;
  name: string;
  keywords: string[];
  responseTemplate: string;
  allowAiRewrite: boolean;
  priority: number;
  enabled: boolean;
  channelScope: ChannelScopeContract;
  createdAt: string;
  updatedAt: string;
}

export interface BotPreviewResponse {
  answer: string;
  source: "template" | "ai" | "fallback";
  handoff: boolean;
}

export interface AiSettingsContract {
  modelTier: AiModelTier;
  enabled: boolean;
  suggestionsEnabled: boolean;
  sentimentEnabled: boolean;
  suggestionMode: AiSuggestionMode;
  sentimentWindow: AiSentimentWindow;
}

export type ChatPlatform = "facebook" | "instagram" | "zalo" | "zalo_personal" | "telegram" | "telegram_personal";
export type ConversationStatus = "open" | "pending" | "closed";

export interface ConversationTagContract {
  id: string;
  name: string;
  color: string;
}

export interface ConversationNoteContract {
  id: string;
  conversationId: string;
  authorId: string;
  authorName: string;
  authorAvatarUrl?: string;
  content: string;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessageContract {
  id: string;
  clientMessageId?: string;
  conversationId: string;
  platform: ChatPlatform;
  senderType: "customer" | "agent" | "bot";
  senderId: string;
  senderName?: string;
  type: "text" | "image" | "video" | "audio" | "file" | "template";
  content: string;
  attachments?: MessageAttachmentContract[];
  deliveryStatus: "pending" | "sent" | "delivered" | "failed";
  createdAt: string;
}

export interface PinnedMessageContract {
  messageId: string;
  content: string;
  type: ChatMessageContract["type"];
  senderName?: string;
  createdAt: string;
  pinnedBy: string;
  pinnedAt: string;
}

export interface ConversationPinEventPayload {
  conversationId: string;
  pinnedMessages: PinnedMessageContract[];
}

export interface MessageAttachmentContract {
  url: string;
  fileName?: string;
  mimeType: string;
}

export interface ConversationContract {
  id: string;
  customerId: string;
  platform: ChatPlatform;
  channelId: string;
  assignedAgentId: string | null;
  botEnabled?: boolean;
  unreadCount: number;
  status: ConversationStatus;
  lastMessageAt: string;
  lastMessageSnippet: string;
  customerName?: string;
  customerAvatarUrl?: string;
  accountName?: string;
  accountAvatarUrl?: string;
  conversationName?: string | null;
  conversationType?: "private" | "group";
  tags?: ConversationTagContract[];
}

export interface QuickReplyAttachmentContract {
  secureUrl: string;
  publicId: string;
  resourceType: "image" | "video" | "raw";
  mimeType: string;
  bytes: number;
  width?: number;
  height?: number;
  duration?: number;
}

export interface QuickReplyContract {
  id: string;
  shortcut: string;
  message: string;
  attachment?: QuickReplyAttachmentContract;
}

export const chatEvents = {
  messageReceived: "chat:message_received",
  conversationUpdated: "chat:conversation_updated",
  deliveryUpdated: "chat:delivery_updated",
  messagePinUpdated: "chat:message_pin_updated",
  joinRoom: "chat:join_room",
  agentTyping: "chat:agent_typing"
} as const;
