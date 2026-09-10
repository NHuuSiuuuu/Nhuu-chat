export interface HealthResponse {
  status: "ok";
  service: "nhuu-chat";
}

export interface AiSuggestionsResponse {
  suggestions: string[];
  source: "gemini" | "fallback";
}

export type ChatPlatform = "facebook" | "instagram" | "zalo" | "telegram" | "telegram_personal";
export type ConversationStatus = "open" | "pending" | "closed";

export interface ConversationTagContract {
  id: string;
  name: string;
  color: string;
}

export interface ChatMessageContract {
  id: string;
  conversationId: string;
  platform: ChatPlatform;
  senderType: "customer" | "agent" | "bot";
  senderId: string;
  senderName?: string;
  type: "text" | "image" | "video" | "audio" | "file" | "template";
  content: string;
  deliveryStatus: "pending" | "sent" | "delivered" | "failed";
  createdAt: string;
}

export interface ConversationContract {
  id: string;
  customerId: string;
  platform: ChatPlatform;
  channelId: string;
  assignedAgentId: string | null;
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

export const chatEvents = {
  messageReceived: "chat:message_received",
  conversationUpdated: "chat:conversation_updated",
  deliveryUpdated: "chat:delivery_updated",
  joinRoom: "chat:join_room",
  agentTyping: "chat:agent_typing"
} as const;
