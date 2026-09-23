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

describe("ChatWindow message avatars", () => {
  it("uses the conversation customer avatar for customer messages", () => {
    const customerAvatarUrl = "https://example.com/customer-avatar.jpg";
    const html = renderToStaticMarkup(<chatWindow.ChatWindow
      conversation={{ ...conversation, customerAvatarUrl }}
      messages={[messages[0]]}
      onSend={async () => true}
      quickReplies={[]}
      pinnedMessages={[]}
      isPinned={() => false}
      onPinMessage={async () => undefined}
      onUnpinMessage={async () => undefined}
    />);
    const customerMessageHtml = html.match(/<article[^>]*data-message-id="message-1"[\s\S]*?<\/article>/)?.[0];

    expect(customerMessageHtml).toContain(`src="${customerAvatarUrl}"`);
  });
});

describe("ChatWindow pinned messages", () => {
  it("toggles the pinned list and exposes the matching arrow direction", () => {
    expect(chatWindow.togglePinnedMessagesList(false)).toBe(true);
    expect(chatWindow.togglePinnedMessagesList(true)).toBe(false);

    const source = readFileSync(new URL("./ChatWindow.tsx", import.meta.url), "utf8");
    expect(source).toContain('aria-label={isPinnedListOpen ? "Thu danh sách tin ghim" : "Mở danh sách tin ghim"}');
    expect(source).toContain('name={isPinnedListOpen ? "chevron-up" : "chevron-down"}');
  });

  it("renders the pinned bar with the canonical quote, capacity count and navigation", () => {
    const html = renderChat();

    expect(html).toContain("Tin đã ghim · 2/10");
    expect(html).toContain("Tin mới nhất cần ghim có nội dung rất dài");
    expect(html).toMatch(/class="[^"]*truncate[^"]*"/);
    expect(html).toContain('aria-label="Mở danh sách tin ghim"');
    expect(html).not.toContain('aria-label="Bỏ ghim tin nhắn"');
  });

  it("copies the selected pinned message quote", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    await chatWindow.copyPinnedMessage("  Nội dung cần sao chép  ", { writeText });

    expect(writeText).toHaveBeenCalledWith("Nội dung cần sao chép");
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

describe("ChatWindow mobile header", () => {
  it("keeps the user identity on one line and groups the right-side controls", () => {
    const source = readFileSync(new URL("./ChatWindow.tsx", import.meta.url), "utf8");

    expect(source).toContain('className="flex min-w-0 flex-1 flex-col"');
    expect(source).toContain('className="mb-1 truncate whitespace-nowrap text-base font-semibold"');
    expect(source).toContain('className="ml-auto flex shrink-0 items-center gap-2 max-[899px]:gap-1"');
    expect(source).toContain('aria-label="Tùy chọn hội thoại"');
    expect(source).toContain('<InboxIcon name="more" />');
    expect(source).not.toContain('aria-label="Thông tin hội thoại"><InboxIcon name="users" />');
  });

  it("gives the identity area the remaining mobile width", () => {
    const source = readFileSync(new URL("./ChatWindow.tsx", import.meta.url), "utf8");

    expect(source).toContain("max-[899px]:gap-2");
    expect(source).toContain("max-[899px]:px-2");
    expect(source).toContain('className="flex min-w-0 flex-1 flex-col"');
    expect(source).toContain("max-[899px]:gap-1");
  });
});

describe("ChatWindow next unread action", () => {
  it("shows the explicit mark-read and open-next action only when enabled", () => {
    const onOpenNextUnread = vi.fn();
    const html = renderToStaticMarkup(<chatWindow.ChatWindow
      conversation={conversation}
      messages={[]}
      onSend={async () => true}
      quickReplies={[]}
      pinnedMessages={[]}
      isPinned={() => false}
      onPinMessage={async () => undefined}
      onUnpinMessage={async () => undefined}
      showOpenNextUnreadAction
      onOpenNextUnread={onOpenNextUnread}
    />);

    expect(html).toContain('aria-label="Đánh dấu đã đọc &amp; mở tiếp theo"');
    expect(html).toContain("Đánh dấu đã đọc &amp; mở tiếp theo");
    expect(onOpenNextUnread).not.toHaveBeenCalled();

    const hiddenHtml = renderToStaticMarkup(<chatWindow.ChatWindow
      conversation={conversation}
      messages={[]}
      onSend={async () => true}
      quickReplies={[]}
      pinnedMessages={[]}
      isPinned={() => false}
      onPinMessage={async () => undefined}
      onUnpinMessage={async () => undefined}
    />);
    expect(hiddenHtml).not.toContain("Đánh dấu đã đọc &amp; mở tiếp theo");
  });
});

describe("ChatWindow loading and composer layout", () => {
  it("renders a loading state instead of the empty-message label while messages load", () => {
    const source = readFileSync(new URL("./ChatWindow.tsx", import.meta.url), "utf8");

    expect(source).toContain("isLoadingMessages = false");
    expect(source).toContain("isLoadingMessages ?");
    expect(source).toContain('aria-label="Đang tải tin nhắn"');
    expect(source).toContain("Chưa có tin nhắn");
  });

  it("keeps the chat column at full height and uses a smooth loading animation", () => {
    const source = readFileSync(new URL("./ChatWindow.tsx", import.meta.url), "utf8");

    expect(source).toContain('className="chat-main flex h-full min-w-0 min-h-0 flex-col bg-slate-100"');
    expect(source).toContain("animate-bounce");
    expect(source).toContain("[animation-delay:-0.3s]");
    expect(source).toContain("[animation-delay:-0.15s]");
    expect(source).toContain("size-8 place-items-center");
    expect(source).not.toMatch(/(?:w|h)-16|md:(?:w|h)-/);
  });

  it("uses the supplied transparent loading animation", () => {
    const source = readFileSync(new URL("./ChatWindow.tsx", import.meta.url), "utf8");

    expect(source).toContain('src="/message-loading-v2.png"');
    expect(source).toContain('alt=""');
    expect(source).toContain('aria-hidden="true"');
    expect(source).toContain('aria-label="Đang tải tin nhắn"');
  });

  it("keeps the message composer visible below the scrollable message area", () => {
    const composer = readFileSync(new URL("./MessageComposer.tsx", import.meta.url), "utf8");

    expect(composer).toContain('className="message-composer shrink-0');
  });
});
