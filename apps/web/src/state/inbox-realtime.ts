import type { ChatMessageContract, ConversationContract } from "@nhuu-chat/contracts";

export function appendUniqueMessage(messages: ChatMessageContract[], message: ChatMessageContract): ChatMessageContract[] {
  return messages.some((item) => item.id === message.id) ? messages : [...messages, message];
}

export function mergeMessages(current: ChatMessageContract[], incoming: ChatMessageContract[]): ChatMessageContract[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
}

export function upsertConversation(conversations: ConversationContract[], conversation: ConversationContract): ConversationContract[] {
  const existing = conversations.find((item) => item.id === conversation.id);
  const merged = {
    ...existing,
    ...conversation,
    accountName: conversation.accountName ?? existing?.accountName,
    accountAvatarUrl: conversation.accountAvatarUrl ?? existing?.accountAvatarUrl,
    tags: conversation.tags ?? existing?.tags
  };
  return [merged, ...conversations.filter((item) => item.id !== conversation.id)]
    .sort((left, right) => right.lastMessageAt.localeCompare(left.lastMessageAt));
}
