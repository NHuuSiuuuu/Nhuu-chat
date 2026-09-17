import type { ConversationPinEventPayload, PinnedMessageContract } from "@nhuu-chat/contracts";

export function replacePinnedMessages(
  _current: PinnedMessageContract[],
  incoming: PinnedMessageContract[]
): PinnedMessageContract[] {
  return [...incoming];
}

export function findPinnedMessage(
  pinnedMessages: PinnedMessageContract[],
  messageId: string
): PinnedMessageContract | undefined {
  return pinnedMessages.find((item) => item.messageId === messageId);
}

export function resetPinnedMessages(_current: PinnedMessageContract[]): PinnedMessageContract[] {
  return [];
}

export function applyPinnedMessagesEvent(
  current: PinnedMessageContract[],
  activeConversationId: string | null,
  payload: ConversationPinEventPayload
): PinnedMessageContract[] {
  if (payload.conversationId !== activeConversationId) return current;
  return replacePinnedMessages(current, payload.pinnedMessages);
}

// Khóa response cũ để dữ liệu ghim của hội thoại trước không ghi đè hội thoại đang mở.
export function createPinnedMessagesRequestGuard() {
  let activeConversationId: string | null = null;
  let latestRequestId = 0;

  return {
    setActiveConversation(conversationId: string | null) {
      if (conversationId === activeConversationId) return;
      activeConversationId = conversationId;
      latestRequestId += 1;
    },
    start(conversationId: string) {
      const requestId = ++latestRequestId;
      return () => requestId === latestRequestId && conversationId === activeConversationId;
    },
    invalidate() {
      latestRequestId += 1;
    }
  };
}
