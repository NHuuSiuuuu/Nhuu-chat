import { describe, expect, it } from "vitest";

import { clampConversationListWidth, conversationDisplayName, conversationInitials, formatConversationTime, conversationPlatformLabel, isNearLatestMessage, markConversationRead } from "./inbox-ui.js";

describe("inbox presentation", () => {
  it("builds a stable customer label and initials without extra API fields", () => {
    expect(conversationDisplayName({ channelId: "8863142234", platform: "telegram_personal" })).toBe("Khách hàng 2234");
    expect(conversationInitials("Khách hàng 2234")).toBe("KH");
  });

  it("formats conversation time for the sidebar", () => {
    expect(formatConversationTime("2026-09-09T08:05:00.000Z")).toMatch(/^\d{2}:\d{2}$/);
  });

  it("uses the real customer name and exposes group/platform presentation data", () => {
    expect(conversationDisplayName({ channelId: "8863142234", platform: "telegram_personal", customerName: "Nguyễn Văn Hữu" })).toBe("Nguyễn Văn Hữu");
    expect(conversationDisplayName({ channelId: "8863142234", platform: "telegram_personal", conversationType: "group" })).toBe("Nhóm hội thoại");
    expect(conversationPlatformLabel("telegram_personal")).toBe("Telegram");
    expect(conversationPlatformLabel("zalo")).toBe("Zalo");
  });

  it("shows the latest-message button only after scrolling past the threshold", () => {
    expect(isNearLatestMessage({ scrollTop: 0, clientHeight: 500, scrollHeight: 500 })).toBe(true);
    expect(isNearLatestMessage({ scrollTop: 200, clientHeight: 500, scrollHeight: 900 })).toBe(false);
    expect(isNearLatestMessage({ scrollTop: 200, clientHeight: 500, scrollHeight: 900 }, 220)).toBe(true);
  });

  it("clears unread count when a conversation is opened", () => {
    expect(markConversationRead({ id: "conversation-1", unreadCount: 4 })).toEqual({ id: "conversation-1", unreadCount: 0 });
  });

  it("keeps the draggable conversation list within desktop bounds", () => {
    expect(clampConversationListWidth(40)).toBe(72);
    expect(clampConversationListWidth(260)).toBe(260);
    expect(clampConversationListWidth(460)).toBe(395);
  });
});
