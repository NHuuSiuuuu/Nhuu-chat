import * as React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import type { ChatMessageContract, ConversationContract, PinnedMessageContract } from "@nhuu-chat/contracts";
import { describe, expect, it, vi } from "vitest";
import * as chatWindow from "./ChatWindow.js";

const conversation = {
  id: "conversation-1",
  customerId: "customer-1",
  platform: "telegram",
  channelId: "channel-1",
  assignedAgentId: "agent-1",
  unreadCount: 0,
  status: "open",
  lastMessageAt: "2026-09-17T08:00:00.000Z",
  lastMessageSnippet: "Tin mới nhất",
  customerName: "Khách hàng"
} satisfies ConversationContract;

const messages = [
  {
    id: "message-1",
    conversationId: conversation.id,
    platform: "telegram",
    senderType: "customer",
    senderId: "customer-1",
    senderName: "Khách hàng",
    type: "text",
    content: "Tin cũ đã ghim",
    deliveryStatus: "delivered",
    createdAt: "2026-09-17T08:00:00.000Z"
  },
  {
    id: "message-2",
    conversationId: conversation.id,
    platform: "telegram",
    senderType: "agent",
    senderId: "agent-1",
    senderName: "Bạn",
    type: "text",
    content: "Tin chưa ghim",
    deliveryStatus: "sent",
    createdAt: "2026-09-17T08:01:00.000Z"
  }
] satisfies ChatMessageContract[];

const pins = [
  {
    messageId: "message-1",
    content: "Tin mới nhất cần ghim có nội dung rất dài để giao diện cắt gọn bằng dấu ba chấm",
    type: "text",
    senderName: "Khách hàng",
    createdAt: "2026-09-17T08:00:00.000Z",
    pinnedBy: "agent-1",
    pinnedAt: "2026-09-17T08:03:00.000Z"
  },
  {
    messageId: "message-old",
    content: "Tin ghim trước đó",
    type: "text",
    createdAt: "2026-09-17T07:00:00.000Z",
    pinnedBy: "agent-1",
    pinnedAt: "2026-09-17T08:02:00.000Z"
  }
] satisfies PinnedMessageContract[];

function renderChat(pinnedMessages: PinnedMessageContract[] = pins, renderedMessages: ChatMessageContract[] = messages): string {
  return renderToStaticMarkup(<chatWindow.ChatWindow
    conversation={conversation}
    messages={renderedMessages}
    onSend={async () => true}
    quickReplies={[]}
    pinnedMessages={pinnedMessages}
    isPinned={(messageId) => pinnedMessages.some((item) => item.messageId === messageId)}
    onPinMessage={async () => undefined}
    onUnpinMessage={async () => undefined}
  />);
}

describe("ChatWindow delivery indicator", () => {
  it.each([
    ["pending", "sending"],
    ["sent", "sent"],
    ["delivered", "sent"],
    ["failed", "failed"]
  ] as const)("maps %s to the %s UI state", (status, expected) => {
    expect(chatWindow.getMessageDeliveryState(status)).toBe(expected);
  });

  it("renders visible status indicators and attachment overlays", () => {
    const source = readFileSync(new URL("./ChatWindow.tsx", import.meta.url), "utf8");

    expect(source).toContain("animate-spin");
    expect(source).toContain('aria-label="Đang gửi tin nhắn"');
    expect(source).toContain('aria-label="Gửi lại tin nhắn"');
    expect(source).toContain("bottom-1 right-0");
    expect(source).not.toContain("bottom-1 -right-5");
    expect(source).toContain('message.senderType === "agent" ? "pr-5" : ""');
    expect(source).toContain("relative");
    expect(source).toContain("MessageDeliveryIndicator");
    expect(source).toContain("message.attachments");
  });
});

describe("ChatWindow pinned messages", () => {
  it("renders the pinned bar with the canonical quote, capacity count and navigation", () => {
    const html = renderChat();

    expect(html).toContain("Tin đã ghim · 2/10");
    expect(html).toContain("Tin mới nhất cần ghim có nội dung rất dài");
    expect(html).toMatch(/class="[^"]*truncate[^"]*"/);
    expect(html).toContain('aria-label="Tin ghim trước"');
    expect(html).toContain('aria-label="Tin ghim tiếp theo"');
    expect(html).toContain('aria-label="Bỏ ghim tin nhắn"');
  });

  it("renders one pin action per message and marks pinned messages outside their content", () => {
    const html = renderChat([pins[0]]);

    expect(html).toContain('data-message-id="message-1"');
    expect(html).toContain('id="chat-message-message-1"');
    expect(html).toContain('aria-label="Ghim tin nhắn"');
    expect(html).toContain('aria-label="Bỏ ghim"');
    expect(html).toContain("Đã ghim");
    expect(html).not.toContain('aria-label="Bày tỏ cảm xúc"');
    expect(html).not.toContain('aria-label="Trả lời tin nhắn"');
    expect(html).not.toContain('aria-label="Thêm tùy chọn"');
  });

  it("disables pinning an unpinned message when the conversation reaches ten pins", () => {
    const tenPins = Array.from({ length: 10 }, (_, index) => ({
      ...pins[0],
      messageId: `pinned-${index}`,
      content: `Tin ghim ${index + 1}`
    }));
    const html = renderChat(tenPins, [messages[1]]);

    expect(html).toContain("Tin đã ghim · 10/10");
    expect(html).toContain('title="Đã đạt giới hạn 10 tin ghim"');
    expect(html).toContain("disabled");
  });

  it("smoothly scrolls to the stable DOM id of the original message", () => {
    const scrollIntoView = vi.fn();
    const getElementById = vi.fn().mockReturnValue({ scrollIntoView });

    chatWindow.scrollToPinnedMessage("message/with space", { getElementById });

    expect(getElementById).toHaveBeenCalledWith("chat-message-message%2Fwith%20space");
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
  });

  it("stops pinned-bar click propagation before requesting unpin", () => {
    const stopPropagation = vi.fn();
    const onUnpinMessage = vi.fn();

    chatWindow.handlePinnedBarUnpin({ stopPropagation }, "message-1", onUnpinMessage);

    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(onUnpinMessage).toHaveBeenCalledWith("message-1");
    expect(stopPropagation.mock.invocationCallOrder[0]).toBeLessThan(onUnpinMessage.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY);
  });
});
