import { describe, expect, it } from "vitest";

import { appendUniqueMessage, mergeMessages, upsertConversation } from "./inbox-realtime.js";

const conversation = {
  id: "conversation-1",
  customerId: "customer-1",
  platform: "telegram_personal" as const,
  channelId: "8863142234",
  assignedAgentId: null,
  unreadCount: 1,
  status: "open" as const,
  lastMessageAt: "2026-09-09T08:00:00.000Z",
  lastMessageSnippet: "Xin chào"
};

const message = {
  id: "message-1",
  conversationId: conversation.id,
  platform: "telegram_personal" as const,
  senderType: "customer" as const,
  senderId: "8863142234",
  type: "text" as const,
  content: "Xin chào",
  deliveryStatus: "delivered" as const,
  createdAt: "2026-09-09T08:00:00.000Z"
};

describe("inbox realtime state", () => {
  it("upserts a newly received conversation and keeps it newest first", () => {
    expect(upsertConversation([], conversation)).toEqual([conversation]);
  });

  it("does not append the same socket message twice", () => {
    expect(appendUniqueMessage([message], message)).toEqual([message]);
  });

  it("merges history without dropping a message received while history was loading", () => {
    const realtimeMessage = { ...message, id: "message-2", content: "Tin realtime", createdAt: "2026-09-09T08:00:01.000Z" };

    expect(mergeMessages([realtimeMessage], [message])).toEqual([message, realtimeMessage]);
  });

  it("preserves identity metadata when a realtime payload is partial", () => {
    const updated = upsertConversation([{ ...conversation, customerName: "Nguyễn Văn Hữu", customerAvatarUrl: "avatar.png" }], { ...conversation, lastMessageSnippet: "Mới" });
    expect(updated[0]).toMatchObject({ customerName: "Nguyễn Văn Hữu", customerAvatarUrl: "avatar.png", lastMessageSnippet: "Mới" });
  });
});
