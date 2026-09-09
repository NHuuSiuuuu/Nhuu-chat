import type { ChatMessageContract, ConversationContract } from "@nhuu-chat/contracts";

export function appendUniqueMessage(messages: ChatMessageContract[], message: ChatMessageContract): ChatMessageContract[] {
  return messages.some((item) => item.id === message.id) ? messages : [...messages, message];
}

export function upsertConversation(conversations: ConversationContract[], conversation: ConversationContract): ConversationContract[] {
  return [conversation, ...conversations.filter((item) => item.id !== conversation.id)]
    .sort((left, right) => right.lastMessageAt.localeCompare(left.lastMessageAt));
}
