import { describe, expect, it } from "vitest";
import type { ConversationPinEventPayload, PinnedMessageContract } from "@nhuu-chat/contracts";

import {
  applyPinnedMessagesEvent,
  createPinnedMessagesRequestGuard,
  findPinnedMessage,
  replacePinnedMessages,
  resetPinnedMessages
} from "./inbox-pins.js";

const oldPin: PinnedMessageContract = {
  messageId: "message-old",
  content: "Tin cũ",
  type: "text",
  createdAt: "2026-09-17T08:00:00.000Z",
  pinnedBy: "agent-1",
  pinnedAt: "2026-09-17T08:01:00.000Z"
};

const newPin: PinnedMessageContract = {
  messageId: "message-new",
  content: "Tin mới",
  type: "text",
  createdAt: "2026-09-17T08:02:00.000Z",
  pinnedBy: "agent-2",
  pinnedAt: "2026-09-17T08:03:00.000Z"
};

describe("inbox pinned-message state", () => {
  it("replaces the entire list with a new canonical list without mutating either input", () => {
    const current = [oldPin];
    const incoming = [newPin];

    const result = replacePinnedMessages(current, incoming);

    expect(result).toEqual([newPin]);
    expect(result).not.toBe(incoming);
    expect(current).toEqual([oldPin]);
    expect(incoming).toEqual([newPin]);
  });

  it("does not duplicate a pin when HTTP and Socket.IO deliver the same canonical list", () => {
    expect(replacePinnedMessages([newPin], [newPin])).toEqual([newPin]);
  });

  it("looks up a pin by message id and resets state without mutating the current list", () => {
    const current = [oldPin, newPin];

    expect(findPinnedMessage(current, "message-new")).toEqual(newPin);
    expect(findPinnedMessage(current, "message-missing")).toBeUndefined();
    expect(resetPinnedMessages(current)).toEqual([]);
    expect(current).toEqual([oldPin, newPin]);
  });

  it("applies only socket payloads for the active conversation", () => {
    const matchingPayload: ConversationPinEventPayload = {
      conversationId: "conversation-active",
      pinnedMessages: [newPin]
    };
    const otherPayload: ConversationPinEventPayload = {
      conversationId: "conversation-other",
      pinnedMessages: [newPin]
    };

    expect(applyPinnedMessagesEvent([oldPin], "conversation-active", matchingPayload)).toEqual([newPin]);
    expect(applyPinnedMessagesEvent([oldPin], "conversation-active", otherPayload)).toEqual([oldPin]);
  });

  it("invalidates stale loads and mutations when a newer request or conversation takes over", () => {
    const guard = createPinnedMessagesRequestGuard();
    guard.setActiveConversation("conversation-a");
    const isFirstCurrent = guard.start("conversation-a");
    const isSecondCurrent = guard.start("conversation-a");

    expect(isFirstCurrent()).toBe(false);
    expect(isSecondCurrent()).toBe(true);

    guard.invalidate();
    expect(isSecondCurrent()).toBe(false);

    const isThirdCurrent = guard.start("conversation-a");
    guard.setActiveConversation("conversation-b");
    expect(isThirdCurrent()).toBe(false);
  });
});
