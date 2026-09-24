import { describe, expect, it } from "vitest";
import type { ChatMessageContract } from "@nhuu-chat/contracts";

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

function outboundMessage(overrides: Partial<ChatMessageContract> = {}): ChatMessageContract {
  return {
    id: "message-1",
    conversationId: "conversation-1",
    platform: "zalo_personal",
    senderType: "agent",
    senderId: "agent-1",
    type: "text",
    content: "Xin chào",
    deliveryStatus: "pending",
    createdAt: "2026-09-17T07:00:00.000Z",
    ...overrides
  };
}

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
    const updated = upsertConversation([{ ...conversation, customerName: "Nguyễn Văn Hữu", customerAvatarUrl: "avatar.png", accountName: "Nhuu Telegram", accountAvatarUrl: "account.png", tags: [{ id: "tag-1", name: "Mua hàng", color: "#22c55e" }] }], { ...conversation, lastMessageSnippet: "Mới" });
    expect(updated[0]).toMatchObject({ customerName: "Nguyễn Văn Hữu", customerAvatarUrl: "avatar.png", accountName: "Nhuu Telegram", accountAvatarUrl: "account.png", tags: [{ id: "tag-1" }], lastMessageSnippet: "Mới" });
  });

  it("keeps the existing avatar when a realtime payload contains an empty avatar URL", () => {
    const updated = upsertConversation([{ ...conversation, customerAvatarUrl: "https://cdn.example/customer.png" }], { ...conversation, customerAvatarUrl: "", lastMessageSnippet: "Mới" });

    expect(updated[0].customerAvatarUrl).toBe("https://cdn.example/customer.png");
  });
});

describe("inbox realtime message correlation", () => {
  it("replaces an optimistic message when the server returns its client correlation id", () => {
    const optimistic = outboundMessage({ id: "optimistic:client-1", clientMessageId: "client-1" });
    const server = outboundMessage({ id: "server-1", clientMessageId: "client-1", deliveryStatus: "sent" });

    expect(appendUniqueMessage([optimistic], server)).toEqual([server]);
  });

  it("does not duplicate a message when the socket copy arrives after the HTTP response", () => {
    const response = outboundMessage({ id: "server-1", clientMessageId: "client-1", deliveryStatus: "sent" });
    const socketCopy = outboundMessage({ id: "server-1", clientMessageId: "client-1", deliveryStatus: "delivered" });

    expect(appendUniqueMessage([response], socketCopy)).toEqual([socketCopy]);
  });

  it("collapses an echo-first socket bubble and optimistic bubble when the HTTP result arrives", () => {
    const optimistic = outboundMessage({ id: "optimistic:client-1", clientMessageId: "client-1", deliveryStatus: "pending" });
    const echo = outboundMessage({ id: "server-1", deliveryStatus: "sent" });
    const authoritativeResponse = outboundMessage({ id: "server-1", clientMessageId: "client-1", deliveryStatus: "sent" });

    expect(appendUniqueMessage([optimistic, echo], authoritativeResponse)).toEqual([authoritativeResponse]);
  });

  it("sorts delayed realtime messages by source creation time", () => {
    const newer = outboundMessage({ id: "newer", createdAt: "2026-09-17T07:00:00.000Z" });
    const delayedOlder = outboundMessage({ id: "older", createdAt: "2026-09-17T06:00:00.000Z" });

    expect(appendUniqueMessage([newer], delayedOlder).map((item) => item.id)).toEqual(["older", "newer"]);
  });

  it("keeps unrelated messages while merging and sorting by creation time", () => {
    const current = [
      outboundMessage({ id: "old", content: "Cũ", createdAt: "2026-09-17T06:00:00.000Z" }),
      outboundMessage({ id: "optimistic:client-2", clientMessageId: "client-2", content: "Mới", createdAt: "2026-09-17T07:00:00.000Z" })
    ];
    const incoming = [outboundMessage({ id: "server-2", clientMessageId: "client-2", content: "Mới", deliveryStatus: "sent", createdAt: "2026-09-17T07:00:00.000Z" })];

    expect(mergeMessages(current, incoming).map((item) => item.id)).toEqual(["old", "server-2"]);
  });
});
