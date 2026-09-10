import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Inbox Tailwind migration", () => {
  it("uses the shared shell without handwritten Inbox CSS", () => {
    const source = readFileSync(new URL("./InboxPage.tsx", import.meta.url), "utf8");
    const list = readFileSync(new URL("../components/conversations/ConversationList.tsx", import.meta.url), "utf8");
    const chat = readFileSync(new URL("../components/conversations/ChatWindow.tsx", import.meta.url), "utf8");

    expect(source).not.toMatch(/InboxPage\.css/);
    expect(source).toContain("DashboardTopbar");
    expect(source).toContain('className="inbox-shell"');
    expect(source).toContain('aria-label="Thanh điều hướng"');
    expect(list).toContain('${item.id === activeId ? "bg-blue-50" : "bg-white"}');
    expect(chat).toContain("rounded-2xl");
    expect(list).not.toContain('bg-white px-3 py-3.5 text-left text-gray-800');
    expect(chat).not.toContain('rounded-lg bg-white px-3 py-2.5 ${message.senderType === "customer" ? "" : "bg-blue-100"}');
    expect(source).toContain("/read");
    expect(chat).toContain("scrollToLatest(\"smooth\")");
    expect(chat).toContain("Tin mới nhất");
    expect(list).toContain("conversationPlatformLabel");
    expect(list).toContain("ConversationAvatar");
    expect(chat).toContain("cancelAnimationFrame");
    expect(chat).toContain("scrollFrameRef");
    expect(chat).toContain("ConversationInfoSidebar");
    expect(source).toContain("markActiveRead");
    expect(source).toContain("message.conversationId === activeId");
    expect(source).toContain("max-[899px]:hidden");
    expect(source).toContain("isConversationListOpen");
    expect(chat).toContain('aria-label="Danh sách hội thoại"');
    expect(chat).toContain("message.senderName");
    expect(chat).toContain("rounded-2xl");
    expect(chat).toContain("group-hover:opacity-100");
    expect(chat).toContain("@All");
    expect(chat).toContain("conversation.customerName?.trim()");
    expect(chat).toContain('message.senderType === "customer" ? "flex-row" : "flex-row-reverse"');
    expect(chat).toContain('message.senderType === "customer" ? "justify-start" : "justify-end"');
    expect(chat).toContain('message.senderType === "customer" && <ConversationAvatar');
    expect(source).toContain("readStateRef");
    expect(source).toContain("generation");
    expect(source).toContain("confirmedGeneration");
    expect(source).toContain("baseline: 0");
    expect(source).toContain("{ ...item, unreadCount: 0 }");
    expect(source).toContain("conversationRevisionRef");
    expect(source).toContain("readState.revision");
    const avatar = readFileSync(new URL("../components/conversations/ConversationAvatar.tsx", import.meta.url), "utf8");
    expect(avatar).toContain("onError");
  });

  it("provides a desktop conversation-list collapsed layout", () => {
    const source = readFileSync(new URL("./InboxPage.tsx", import.meta.url), "utf8");
    const list = readFileSync(new URL("../components/conversations/ConversationList.tsx", import.meta.url), "utf8");

    expect(source).toContain("conversationListWidth");
    expect(list).toContain("collapsed");
    expect(list).toContain("w-[72px]");
  });

  it("uses a pointer drag handle instead of a collapse click action", () => {
    const source = readFileSync(new URL("./InboxPage.tsx", import.meta.url), "utf8");
    const list = readFileSync(new URL("../components/conversations/ConversationList.tsx", import.meta.url), "utf8");

    expect(source).toContain("clampConversationListWidth");
    expect(source).toContain("onPointerMove");
    expect(list).toContain("onPointerDown");
    expect(list).toContain("cursor-col-resize");
    expect(list).toContain("Kéo để thay đổi kích thước danh sách hội thoại");
    expect(list).not.toContain("Thu gọn danh sách");
  });
});
