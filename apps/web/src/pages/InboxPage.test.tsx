import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createAiSuggestionsRequestGuard } from "./InboxPage.js";

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
    expect(chat).toContain("px-4 py-3 text-sm leading-6");
    expect(chat).not.toContain("px-4 py-3 text-base leading-6");
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
    expect(source).toContain("/api/v1/conversation-tags");
    expect(source).toContain("/tags");
    expect(source).toContain("tagIds");
    expect(source).toContain("/tags`, token, { method: \"PUT\"");
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

  it("renders the conversation row with platform identity and optional tag badges", () => {
    const list = readFileSync(new URL("../components/conversations/ConversationList.tsx", import.meta.url), "utf8");

    expect(list).toContain("PlatformIcon");
    expect(list).toContain("item.tags");
    expect(list).toContain("conversation-tag");
    expect(list).toContain("item.accountName");
    expect(list).toContain("item.accountAvatarUrl");
    expect(list).toContain("conversationAccountName");
    expect(list).toContain('PlatformIcon provider={platform} size={15} plain');
    expect(list).toContain("conversation-account flex min-w-0 items-center gap-1.5 leading-4");
    expect(list).toContain('className="min-w-0 truncate leading-4"');
    expect(list).toContain("truncate");
    expect(list).toContain("min-h-[88px]");
    expect(list).toContain("availableTags");
    expect(list).toContain("onTagsChange");
  });

  it("owns the authenticated Gemini suggestions request and state", () => {
    const source = readFileSync(new URL("./InboxPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("AiSuggestionsResponse");
    expect(source).toContain("/api/v1/conversations/${id}/ai-suggestions");
    expect(source).toContain('method: "POST"');
    expect(source).toContain("isAiSuggestionsLoading");
    expect(source).toContain("aiSuggestionsError");
    expect(source).toContain("onRefreshAiSuggestions");
    expect(source).toContain("setAiSuggestions(null)");
  });

  it("passes Gemini suggestion state through ChatWindow", () => {
    const source = readFileSync(new URL("./InboxPage.tsx", import.meta.url), "utf8");
    const chat = readFileSync(new URL("../components/conversations/ChatWindow.tsx", import.meta.url), "utf8");

    expect(source).toContain("aiSuggestions={aiSuggestions}");
    expect(source).toContain("isAiSuggestionsLoading={isAiSuggestionsLoading}");
    expect(source).toContain("aiSuggestionsError={aiSuggestionsError}");
    expect(source).toContain("onRefreshAiSuggestions={refreshAiSuggestions}");
    expect(chat).toContain("aiSuggestions");
    expect(chat).toContain("isAiSuggestionsLoading");
    expect(chat).toContain("aiSuggestionsError");
    expect(chat).toContain("onRefreshAiSuggestions");
  });

  it("does not apply an older suggestion response after the active conversation changes", async () => {
    const guard = createAiSuggestionsRequestGuard();
    const first = deferred<string>();
    const second = deferred<string>();
    const applied: string[] = [];

    guard.setActiveConversation("conversation-a");
    const isFirstCurrent = guard.start("conversation-a");
    const firstResult = first.promise.then((value) => { if (isFirstCurrent()) applied.push(value); });

    guard.setActiveConversation("conversation-b");
    const isSecondCurrent = guard.start("conversation-b");
    const secondResult = second.promise.then((value) => { if (isSecondCurrent()) applied.push(value); });

    second.resolve("new suggestion");
    first.resolve("stale suggestion");
    await Promise.all([firstResult, secondResult]);

    expect(applied).toEqual(["new suggestion"]);
  });

  it("keeps the newer request loading after an older request settles", async () => {
    const guard = createAiSuggestionsRequestGuard();
    const first = deferred<string>();
    const second = deferred<string>();
    const applied: string[] = [];
    let isLoading = false;

    guard.setActiveConversation("conversation-a");
    const isFirstCurrent = guard.start("conversation-a");
    isLoading = true;
    const firstResult = first.promise.then((value) => {
      if (isFirstCurrent()) {
        applied.push(value);
        isLoading = false;
      }
    });

    guard.setActiveConversation("conversation-b");
    const isSecondCurrent = guard.start("conversation-b");
    isLoading = true;
    const secondResult = second.promise.then((value) => {
      if (isSecondCurrent()) {
        applied.push(value);
        isLoading = false;
      }
    });

    first.resolve("stale suggestion");
    await firstResult;
    expect(applied).toEqual([]);
    expect(isLoading).toBe(true);

    second.resolve("current suggestion");
    await secondResult;
    expect(applied).toEqual(["current suggestion"]);
    expect(isLoading).toBe(false);
  });

  it("ignores an older request error after the active conversation changes", async () => {
    const guard = createAiSuggestionsRequestGuard();
    const first = deferred<string>();
    const second = deferred<string>();
    let error: string | null = null;
    let isLoading = false;

    guard.setActiveConversation("conversation-a");
    const isFirstCurrent = guard.start("conversation-a");
    isLoading = true;
    const firstResult = first.promise.catch((reason: string) => {
      if (isFirstCurrent()) {
        error = reason;
        isLoading = false;
      }
    });

    guard.setActiveConversation("conversation-b");
    const isSecondCurrent = guard.start("conversation-b");
    error = null;
    isLoading = true;
    const secondResult = second.promise.then(() => {
      if (isSecondCurrent()) isLoading = false;
    });

    first.reject("stale error");
    await firstResult;
    expect(error).toBeNull();
    expect(isLoading).toBe(true);

    second.resolve("current suggestion");
    await secondResult;
    expect(isLoading).toBe(false);
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((complete, fail) => { resolve = complete; reject = fail; });
  return { promise, resolve, reject };
}
