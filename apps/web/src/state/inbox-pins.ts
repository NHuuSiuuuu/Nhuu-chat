import type { ConversationPinEventPayload, PinnedMessageContract } from "@nhuu-chat/contracts";

export type ConversationPinnedMessagesState = {
  conversationId: string | null;
  pinnedMessages: PinnedMessageContract[];
};

export function getPinnedMessagesForConversation(
  state: ConversationPinnedMessagesState,
  conversationId: string | null
): PinnedMessageContract[] {
  return state.conversationId === conversationId ? state.pinnedMessages : [];
}

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
  let latestLoadRequestId = 0;

  function startLoad(conversationId: string) {
    const requestId = ++latestLoadRequestId;
    return () => requestId === latestLoadRequestId && conversationId === activeConversationId;
  }

  function invalidateLoad() {
    latestLoadRequestId += 1;
  }

  return {
    setActiveConversation(conversationId: string | null) {
      if (conversationId === activeConversationId) return;
      activeConversationId = conversationId;
      invalidateLoad();
    },
    startLoad,
    startMutation(conversationId: string) {
      return () => conversationId === activeConversationId;
    },
    invalidateLoad
  };
}
