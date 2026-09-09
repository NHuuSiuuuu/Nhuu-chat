import { describe, expect, it } from "vitest";

import { conversationDisplayName, conversationInitials, formatConversationTime } from "./inbox-ui.js";

describe("inbox presentation", () => {
  it("builds a stable customer label and initials without extra API fields", () => {
    expect(conversationDisplayName({ channelId: "8863142234", platform: "telegram_personal" })).toBe("Khách hàng 2234");
    expect(conversationInitials("Khách hàng 2234")).toBe("KH");
  });

  it("formats conversation time for the sidebar", () => {
    expect(formatConversationTime("2026-09-09T08:05:00.000Z")).toMatch(/^\d{2}:\d{2}$/);
  });
});
