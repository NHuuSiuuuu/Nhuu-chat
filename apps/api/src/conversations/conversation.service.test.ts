import { describe, expect, it } from "vitest";

import { toConversation } from "../services/conversation.service.js";

describe("conversation presentation contract", () => {
  it("includes populated customer identity and conversation type", () => {
    const result = toConversation({
      _id: "conversation-1",
      customerId: { _id: "customer-1", name: "Nguyễn Văn Hữu", avatarUrl: "https://cdn.example/avatar.png" },
      platform: "zalo",
      channelId: "group-1",
      conversationName: "Nhóm sân bóng",
      conversationType: "group",
      accountName: "Nhuu Telegram",
      accountAvatarUrl: "https://cdn.example/account.png",
      assignedAgentId: null,
      unreadCount: 3,
      status: "open",
      lastMessageAt: "2026-09-09T08:05:00.000Z",
      lastMessageSnippet: "Xin chào"
    });

    expect(result).toMatchObject({
      customerId: "customer-1",
      customerName: "Nguyễn Văn Hữu",
      customerAvatarUrl: "https://cdn.example/avatar.png",
      conversationName: "Nhóm sân bóng",
      conversationType: "group",
      accountName: "Nhuu Telegram",
      accountAvatarUrl: "https://cdn.example/account.png"
    });
  });
});
