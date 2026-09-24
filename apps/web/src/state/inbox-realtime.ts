import type { ChatMessageContract, ConversationContract } from "@nhuu-chat/contracts";

function sameMessage(left: ChatMessageContract, right: ChatMessageContract): boolean {
  return left.id === right.id || Boolean(left.clientMessageId && right.clientMessageId && left.clientMessageId === right.clientMessageId);
}

export function appendUniqueMessage(messages: ChatMessageContract[], message: ChatMessageContract): ChatMessageContract[] {
  return [...messages.filter((item) => !sameMessage(item, message)), message]
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
}

export function setMessageDeliveryStatus(messages: ChatMessageContract[], messageId: string, deliveryStatus: ChatMessageContract["deliveryStatus"]): ChatMessageContract[] {
  return messages.map((message) => message.id === messageId ? { ...message, deliveryStatus } : message);
}

export function mergeMessages(current: ChatMessageContract[], incoming: ChatMessageContract[]): ChatMessageContract[] {
  let merged = current;
  for (const message of incoming) merged = appendUniqueMessage(merged, message);
  return [...merged].sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
}

export function upsertConversation(conversations: ConversationContract[], conversation: ConversationContract): ConversationContract[] {
  const existing = conversations.find((item) => item.id === conversation.id);
  const merged = {
    ...existing,
    ...conversation,
    customerAvatarUrl: conversation.customerAvatarUrl?.trim() || existing?.customerAvatarUrl,
    accountName: conversation.accountName ?? existing?.accountName,
    accountAvatarUrl: conversation.accountAvatarUrl ?? existing?.accountAvatarUrl,
    tags: conversation.tags ?? existing?.tags
  };
  return [merged, ...conversations.filter((item) => item.id !== conversation.id)]
    .sort((left, right) => right.lastMessageAt.localeCompare(left.lastMessageAt));
}
