import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { buildConversationListRequestPath, createAiSuggestionsRequestGuard, createOptimisticMessage, facebookMessengerSendErrorMessage, getConversationDraft, setConversationDraft, setMessageDeliveryStatus, shouldAutoRefreshAiSuggestions } from "./InboxPage.js";
import * as inboxModule from "./InboxPage.js";
import { filterConversationsByTag, getVisibleConversationTagCount, UNTAGGED_CONVERSATION_FILTER } from "../components/conversations/ConversationList.js";

describe("Inbox Tailwind migration", () => {
  it("creates a pending optimistic agent message before delivery", () => {
    const optimistic = createOptimisticMessage({
      id: "conversation-1",
      platform: "zalo_personal",
      customerId: "customer-1",
      channelId: "thread-1",
      assignedAgentId: "agent-1",
      unreadCount: 0,
      status: "open",
      lastMessageAt: "2026-09-17T07:00:00.000Z",
      lastMessageSnippet: ""
    }, "Xin chào", "client-1", "2026-09-17T07:01:00.000Z");

    expect(optimistic).toMatchObject({
      id: "optimistic:client-1",
      clientMessageId: "client-1",
      conversationId: "conversation-1",
      senderType: "agent",
      content: "Xin chào",
      deliveryStatus: "pending"
    });
  });

  it("marks only the matching optimistic message as failed while preserving its payload", () => {
    const optimistic = createOptimisticMessage({
      id: "conversation-1",
      platform: "zalo_personal",
      customerId: "customer-1",
      channelId: "thread-1",
      assignedAgentId: "agent-1",
      unreadCount: 0,
      status: "open",
      lastMessageAt: "2026-09-17T07:00:00.000Z",
      lastMessageSnippet: ""
    }, "Xin chào", "client-1", "2026-09-17T07:01:00.000Z");

    expect(setMessageDeliveryStatus([optimistic], optimistic.id, "failed")).toEqual([{ ...optimistic, deliveryStatus: "failed" }]);
  });

  it("wires retry handling and keeps the composer content when sending fails", () => {
    const source = readFileSync(new URL("./InboxPage.tsx", import.meta.url), "utf8");
    const chat = readFileSync(new URL("../components/conversations/ChatWindow.tsx", import.meta.url), "utf8");
    const composer = readFileSync(new URL("../components/conversations/MessageComposer.tsx", import.meta.url), "utf8");

    expect(source).toContain("retryPayloadsRef");
    expect(source).toContain("clientMessageId");
    expect(source).toContain("setMessageDeliveryStatus");
    expect(chat).toContain("onRetryMessage");
    expect(chat).toContain("deliveryStatus");
    expect(composer).toContain("Promise<boolean>");
    expect(composer).toContain("if (!sent) return");
  });

  it("uses multipart form data for outbound attachments", () => {
    const source = readFileSync(new URL("./InboxPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("new FormData()");
    expect(source).toContain('formData.append("attachment", payload.attachment)');
    expect(source).toContain('payload.attachment.type.startsWith("image/") ? "image" : "file"');
  });

  it("filters conversations by the dashboard account without filtering merge view", () => {
    expect(buildConversationListRequestPath("zalo_personal")).toBe("/api/v1/conversations?platform=zalo_personal");
    expect(buildConversationListRequestPath("telegram_personal")).toBe("/api/v1/conversations?platform=telegram_personal");
    expect(buildConversationListRequestPath()).toBe("/api/v1/conversations");
  });

  it("filters Facebook Inbox by Page and uses shared realtime and send paths", () => {
    expect(buildConversationListRequestPath("facebook", "page/42")).toBe("/api/v1/conversations?platform=facebook&channelId=page%2F42");
    const source = readFileSync(new URL("./InboxPage.tsx", import.meta.url), "utf8");
    expect(source).toContain('"/api/v1/messages/send"');
    expect(source).toContain("chatEvents.messageReceived");
    expect(source).toContain("conversation.platform !== platform");
    expect(source).toContain('active.platform === "facebook" && typeof initialPayload !== "string"');
    expect(source).toContain("chatEvents.conversationUpdated");
    expect(facebookMessengerSendErrorMessage("FACEBOOK_MESSENGER_PERMISSION_DENIED")).toBe("Facebook chưa cấp quyền nhắn tin cho Page này.");
    expect(facebookMessengerSendErrorMessage("unknown-code")).toBe("Chưa gửi được tin nhắn Messenger. Hãy thử lại sau.");
  });

  it("keeps message drafts isolated by conversation", () => {
    const drafts = setConversationDraft({}, "conversation-a", "helo");

    expect(getConversationDraft(drafts, "conversation-a")).toBe("helo");
    expect(getConversationDraft(drafts, "conversation-b")).toBe("");
    expect(getConversationDraft(setConversationDraft(drafts, "conversation-a", ""), "conversation-a")).toBe("");
  });

  it("shows more conversation tags as the sidebar gets wider", () => {
    expect(getVisibleConversationTagCount(230, 6)).toBe(1);
    expect(getVisibleConversationTagCount(320, 6)).toBe(2);
    expect(getVisibleConversationTagCount(530, 6)).toBe(4);
    expect(getVisibleConversationTagCount(530, 2)).toBe(2);
  });

  it("filters by a created tag or conversations without tags", () => {
    const tagged = { id: "conversation-tagged", tags: [{ id: "tag-vip", name: "VIP", color: "#111111" }] };
    const otherTagged = { id: "conversation-other", tags: [{ id: "tag-new", name: "Mới", color: "#222222" }] };
    const untagged = { id: "conversation-untagged", tags: [] };

    expect(filterConversationsByTag([tagged, otherTagged, untagged] as never[], "tag-vip").map((item) => item.id)).toEqual(["conversation-tagged"]);
    expect(filterConversationsByTag([tagged, otherTagged, untagged] as never[], UNTAGGED_CONVERSATION_FILTER).map((item) => item.id)).toEqual(["conversation-untagged"]);
    expect(filterConversationsByTag([tagged, otherTagged, untagged] as never[], null).map((item) => item.id)).toEqual(["conversation-tagged", "conversation-other", "conversation-untagged"]);
  });

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
    expect(chat).toContain("text-sm leading-6");
    expect(chat).toContain("px-4 py-3");
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
    expect(source).toContain("fixed left-[44px] right-0 top-16 bottom-0 z-50 flex");
    expect(source).toContain("isConversationListOpen ? \"max-[899px]:hidden\" : \"\"");
    expect(source).not.toContain("fixed top-28 bottom-0 left-[44px] z-50 flex w-[calc(100vw-44px)]");
    expect(source).not.toContain("fixed inset-y-0 left-[44px] z-50 flex w-[calc(100vw-44px)]");
    expect(source).not.toContain("w-[min(395px,calc(100vw-44px))]");
    expect(source).toContain("/api/v1/conversation-tags");
    expect(source).toContain("/tags");
    expect(source).toContain("tagIds");
    expect(source).toContain("/tags`, token, { method: \"PUT\"");
    expect(chat).toContain('aria-label="Quay lại danh sách hội thoại"');
    expect(chat).toContain('<InboxIcon name="chevron-left"');
    expect(chat).toContain("message.senderName");
    expect(chat).toContain("message.attachments");
    expect(chat).toContain("Tải tệp đính kèm");
    expect(chat).toContain("rounded-2xl");
    expect(chat).toContain("group-hover:opacity-100");
    expect(chat).toContain("@All");
    expect(chat).toContain("conversation.customerName?.trim()");
    expect(chat).toContain('message.senderType === "customer" ? "flex-row" : "flex-row-reverse"');
    expect(chat).toContain('message.senderType === "customer" ? "justify-start" : "justify-end"');
    expect(chat).toContain('message.senderType === "customer" && <ConversationAvatar');
    expect(list).toContain("rounded-tl-none");
    expect(source).toContain("readStateRef");
    expect(source).toContain("generation");
    expect(source).toContain("confirmedGeneration");
    expect(source).toContain("baseline: 0");
    expect(source).toContain("{ ...item, unreadCount: 0 }");
    expect(source).toContain("conversationRevisionRef");
    expect(source).toContain("readState.revision");
    expect(source).not.toContain("setActiveId((current) => current ?? result.conversations[0]?.id ?? null)");
    expect(source).not.toContain("setActiveId((current) => current ?? conversation.id)");
    expect(chat).toContain("Chọn một hội thoại từ danh sách bên trái");
    expect(chat).toContain("Mở danh sách hội thoại");
    expect(chat).toContain("hasConversation={Boolean(conversation)}");
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
    expect(list).toContain("visibleTags");
    expect(list).toContain("hiddenCount");
    expect(list).toContain("Xem");
    expect(list).toContain("whitespace-nowrap");
    expect(list).toContain("overflow-hidden");
    expect(list).toContain("ResizeObserver");
    expect(list).toContain("getVisibleConversationTagCount");
    expect(list).toContain("getVisibleConversationTagCount(sidebarWidth, tags)");
    expect(list).not.toContain("conversation-tag max-w-[88px] truncate");
    expect(list).toContain("flex min-w-0 flex-1 items-center gap-1.5");
    expect(list).toContain("flex-1 items-center gap-1.5 overflow-hidden");
    expect(list).toContain("item.accountName");
    expect(list).toContain("item.accountAvatarUrl");
    expect(list).toContain("conversationAccountName");
    expect(list).toContain("hasExplicitAccountName");
    expect(list).toContain("accountName.toLowerCase() !== conversationPlatformLabel(item.platform).toLowerCase()");
    expect(list).toContain('PlatformIcon provider={platform} size={16} plain');
    expect(list).toContain('className="ml-auto shrink-0" title={conversationPlatformLabel(item.platform)}><PlatformIcon provider={platform} size={16} plain />');
    expect(list).not.toContain('<span className="leading-4">{conversationPlatformLabel(item.platform)}</span>');
    expect(list).toContain("conversation-account flex min-w-0 items-center gap-1.5 leading-4");
    expect(list).toContain('className="min-w-0 max-w-[120px] truncate leading-4"');
    expect(list).toContain("truncate");
    expect(list).toContain("min-h-[88px]");
    expect(list).not.toContain('name="send"');
    expect(list).not.toContain('name="tag"');
    expect(list).toContain("availableTags");
    expect(list).toContain("Không gắn thẻ");
    expect(list).toContain("Lọc theo");
    expect(list).toContain('aria-label="Lọc theo thẻ"');
    expect(list).toContain("whitespace-nowrap");
    expect(list).toContain("min-w-max");
    expect(list).not.toContain("onTagsChange");
    expect(list).not.toContain("openTagId");
    expect(list).not.toContain("Gắn thẻ cho ${name}");
  });

  it("shows conversation skeletons while the initial list is loading", () => {
    const source = readFileSync(new URL("./InboxPage.tsx", import.meta.url), "utf8");
    const list = readFileSync(new URL("../components/conversations/ConversationList.tsx", import.meta.url), "utf8");

    expect(source).toContain("isConversationListLoading");
    expect(source).toContain("isLoading={isConversationListLoading}");
    expect(list).toContain("isLoading?: boolean");
    expect(list).toContain("aria-label=\"Đang tải danh sách hội thoại\"");
    expect(list).toContain("animate-pulse");
    expect(list).toContain("Chưa có hội thoại");
  });

  it("overlays the unread badge on the avatar corner", () => {
    const list = readFileSync(new URL("../components/conversations/ConversationList.tsx", import.meta.url), "utf8");

    expect(list).toContain('className="relative shrink-0"');
    expect(list).toContain('conversation-unread absolute -bottom-1 -right-1 grid size-5 place-items-center rounded-full border-2 border-white bg-red-500');
    expect(list).toContain('aria-label={`${item.unreadCount > 99 ? "99+" : item.unreadCount} thông báo chưa đọc`}');
    expect(list).not.toContain('flex shrink-0 flex-col items-center gap-1');
  });

  it("hides scrollbars while preserving scrollable conversation surfaces", () => {
    const list = readFileSync(new URL("../components/conversations/ConversationList.tsx", import.meta.url), "utf8");
    const chat = readFileSync(new URL("../components/conversations/ChatWindow.tsx", import.meta.url), "utf8");
    const composer = readFileSync(new URL("../components/conversations/MessageComposer.tsx", import.meta.url), "utf8");

    expect(list).toContain("conversation-items min-h-0 flex-1 overflow-y-auto scrollbar-none");
    expect(list).toContain("conversation-sidebar flex h-full");
    expect(chat).toContain("chat-messages relative min-h-0 flex-1 overflow-y-auto");
    expect(composer).toContain("flex gap-2 overflow-x-auto scrollbar-none");
  });

  it("keeps message loading separate from the empty conversation state", () => {
    const source = readFileSync(new URL("./InboxPage.tsx", import.meta.url), "utf8");
    const chat = readFileSync(new URL("../components/conversations/ChatWindow.tsx", import.meta.url), "utf8");

    expect(source).toContain("isLoadingMessages");
    expect(source).toContain("setIsLoadingMessages(true)");
    expect(source).toContain("setIsLoadingMessages(false)");
    expect(source).toContain("isLoadingMessages={isLoadingMessages}");
    expect(source).toContain('className={`flex min-h-0 flex-1 flex-col ${isConversationListOpen ? "max-[899px]:hidden" : ""}`}');
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

  it("passes backend quick replies through ChatWindow to MessageComposer", () => {
    const source = readFileSync(new URL("./InboxPage.tsx", import.meta.url), "utf8");
    const chat = readFileSync(new URL("../components/conversations/ChatWindow.tsx", import.meta.url), "utf8");

    expect(source).toContain("quickReplies={quickReplies}");
    expect(chat).toContain("quickReplies: QuickReplyContract[]");
    expect(chat).toContain("<MessageComposer");
    expect(chat).toContain("quickReplies={quickReplies}");
  });

  it("lets the active agent take over a conversation and pauses bot handling", () => {
    const source = readFileSync(new URL("./InboxPage.tsx", import.meta.url), "utf8");
    const chat = readFileSync(new URL("../components/conversations/ChatWindow.tsx", import.meta.url), "utf8");

    expect(source).toContain("/bot");
    expect(source).toContain("botEnabled");
    expect(source).toContain("onToggleBot");
    expect(chat).toContain('role="switch"');
    expect(chat).toContain("Bot tự động");
    expect(chat).toContain("onToggleBot");
  });

  it("renders the conversation platform as an icon in the chat header", () => {
    const chat = readFileSync(new URL("../components/conversations/ChatWindow.tsx", import.meta.url), "utf8");

    expect(chat).toContain("PlatformIcon");
    expect(chat).toContain('aria-label={conversationPlatformLabel(conversation.platform)}');
    expect(chat).toContain("platformIconProvider");
    expect(chat).not.toContain('className="inline-flex items-center rounded-full text-gray-900  px-2 py-0.5 text-[11px] font-semibold text-gray-900">{conversationPlatformLabel(conversation.platform)}');
  });

  it("uses sonner for customer messages without notifying for agent messages", () => {
    const source = readFileSync(new URL("./InboxPage.tsx", import.meta.url), "utf8");

    expect(source).toContain('import { toast } from "sonner"');
    expect(source).toContain("toast.custom");
    expect(source).not.toContain("messageToasts");
    expect(source).not.toContain("<MessageToast");
    expect(source).not.toContain("appendMessageToast");
    expect(source).toContain('message.senderType === "customer"');
    expect(source).toContain("incomingToastIdsRef");
    expect(source).toContain("slice(-3)");
    expect(source).toContain("selectConversation(message.conversationId)");
    expect(source).toContain("toast.dismiss(toastId)");
  });

  it("selects the requested conversation after the inbox list loads", () => {
    const source = readFileSync(new URL("./InboxPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("selectedConversationId?: string | null");
    expect(source).toContain("handledRequestedConversationRef.current = selectedConversationRequest");
    expect(source).toContain("isRequestedConversationAlreadyActive(selectedConversationId, activeId)");
    expect(source).toContain("selectConversation(selectedConversationId, false)");
    expect(source).toContain("chatEvents.conversationDeleted");
    expect(source).toContain('params.set("conversationId", id)');
    expect(source).toContain('"nhuu-chat.inbox-list-open"');
  });

  it("checkpoints drafts and scroll positions on background and scopes them to the active Workspace", () => {
    const source = readFileSync(new URL("./InboxPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("inboxSessionStorageKey(user?.id, workspaceId)");
    expect(source).toContain('document.addEventListener("visibilitychange", persistWhenHidden)');
    expect(source).toContain('window.addEventListener("pagehide", persistSessionState)');
    expect(source).toContain("drafts: draftsRef.current");
    expect(source).toContain("scrollPositions: scrollPositionsRef.current");
    expect(source).toContain("savedScrollTop={activeId ? scrollPositionsRef.current[activeId] : undefined}");
    expect(source).toContain("onScrollPositionChange={(id, scrollTop) => { scrollPositionsRef.current[id] = scrollTop; }}");
  });

  it("pauses realtime in the background and refreshes missed inbox data on resume", () => {
    const source = readFileSync(new URL("./InboxPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("pauseSocketWhenHidden(socket, document, syncAfterResume)");
    expect(source).toContain("mergeMessages(current, result.messages)");
    expect(source).toContain("socket.disconnect()");
  });

  it("applies per-account notification and unread-navigation settings without a second sound path", () => {
    const source = readFileSync(new URL("./InboxPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("loadGeneralSettings({ apiUrl: API_URL, token, refresh })");
    expect(source).toContain("hasCurrentGeneralSettings && shouldNotifyForIncomingMessage(generalSettings, message.senderType)");
    expect(source).toContain("new Notification(senderName");
    expect(source).not.toContain("playIncomingNotificationSound");
    expect(source).toContain("orderConversationsByUnread(conversations, hasCurrentGeneralSettings && generalSettings.moveUnreadConversationsToTop)");
    expect(source).toContain("generalSettings.openNextUnreadConversation");
    expect(source).toContain("getNextUnreadConversationId(unreadOrdered, activeId)");
    expect(source).toContain("if (!activeId || !await markActiveRead(activeId)) return");
    expect(source).not.toContain("previousConversation.unreadCount > 0");
  });

  it("defines the socket room join handler before registering it", () => {
    const source = readFileSync(new URL("./InboxPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("const joinActiveRoom = () =>");
    expect(source).toContain("socket.on(\"connect\", joinActiveRoom)");
  });

  it("loads and mutates the active conversation pins through canonical API responses", () => {
    const source = readFileSync(new URL("./InboxPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("createPinnedMessagesRequestGuard");
    expect(source).toContain("getPinnedMessagesForConversation");
    expect(source).toContain("startLoad(activeId)");
    expect(source).toContain("startMutation(conversationId)");
    expect(source).toContain("/api/v1/conversations/${activeId}/pins");
    expect(source).toContain('method: "POST"');
    expect(source).toContain('JSON.stringify({ messageId })');
    expect(source).toContain('method: "DELETE"');
    expect(source).toContain("encodeURIComponent(messageId)");
    expect(source).toContain("if (isActiveMutation()) setPinnedMessagesError");
  });

  it("replaces pins from the active realtime room and cleans up the socket listener", () => {
    const source = readFileSync(new URL("./InboxPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("chatEvents.messagePinUpdated");
    expect(source).toContain("ConversationPinEventPayload");
    expect(source).toContain("applyPinnedMessagesEvent");
    expect(source).toContain("socket.off(chatEvents.messagePinUpdated");
  });

  it("passes pin state, lookup and mutation callbacks to ChatWindow without rendering pin UI here", () => {
    const source = readFileSync(new URL("./InboxPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("pinnedMessages");
    expect(source).toContain("isPinned");
    expect(source).toContain("onPinMessage");
    expect(source).toContain("onUnpinMessage");
  });

  it("loads quick replies exactly once and applies the current result", async () => {
    expect(typeof inboxModule.createQuickRepliesRequestGuard).toBe("function");
    expect(typeof inboxModule.loadInboxQuickReplies).toBe("function");

    if (typeof inboxModule.createQuickRepliesRequestGuard === "function" && typeof inboxModule.loadInboxQuickReplies === "function") {
      const request = vi.fn().mockResolvedValue({ quickReplies: [{ id: "reply-1", shortcut: "chao", message: "Xin chào" }] });
      const apply = vi.fn();
      const guard = inboxModule.createQuickRepliesRequestGuard();

      await inboxModule.loadInboxQuickReplies(request, apply, guard.start());

      expect(request).toHaveBeenCalledTimes(1);
      expect(apply).toHaveBeenCalledOnce();
      expect(apply).toHaveBeenCalledWith([{ id: "reply-1", shortcut: "chao", message: "Xin chào" }]);
    }
  });

  it("ignores a stale quick-reply response after a newer load starts", async () => {
    expect(typeof inboxModule.createQuickRepliesRequestGuard).toBe("function");
    expect(typeof inboxModule.loadInboxQuickReplies).toBe("function");

    if (typeof inboxModule.createQuickRepliesRequestGuard === "function" && typeof inboxModule.loadInboxQuickReplies === "function") {
      const first = deferred<{ quickReplies: Array<{ id: string; shortcut: string; message: string }> }>();
      const second = deferred<{ quickReplies: Array<{ id: string; shortcut: string; message: string }> }>();
      const apply = vi.fn();
      const guard = inboxModule.createQuickRepliesRequestGuard();
      const firstLoad = inboxModule.loadInboxQuickReplies(() => first.promise, apply, guard.start());
      const secondLoad = inboxModule.loadInboxQuickReplies(() => second.promise, apply, guard.start());

      second.resolve({ quickReplies: [{ id: "reply-2", shortcut: "moi", message: "Mẫu mới" }] });
      await secondLoad;
      first.resolve({ quickReplies: [{ id: "reply-1", shortcut: "cu", message: "Mẫu cũ" }] });
      await firstLoad;

      expect(apply).toHaveBeenCalledTimes(1);
      expect(apply).toHaveBeenCalledWith([{ id: "reply-2", shortcut: "moi", message: "Mẫu mới" }]);
    }
  });

  it("loads AI settings and sends the configured suggestion trigger", () => {
    const source = readFileSync(new URL("./InboxPage.tsx", import.meta.url), "utf8");
    const composer = readFileSync(new URL("../components/conversations/MessageComposer.tsx", import.meta.url), "utf8");

    expect(source).toContain("AiSettingsContract");
    expect(source).toContain("/api/v1/ai-settings");
    expect(source).toContain("suggestionsEnabled");
    expect(source).toContain('refreshAiSuggestions(activeId, "conversation_open")');
    expect(source).toContain('refreshAiSuggestions(activeId, "customer_message")');
    expect(source).toContain('trigger: "manual"');
    expect(source).toContain("aiSuggestionsEnabled");
    expect(composer).toContain("aiSuggestionsEnabled");
  });

  it("does not auto-request suggestions for manual mode", () => {
    expect(shouldAutoRefreshAiSuggestions("manual", "conversation_open")).toBe(false);
    expect(shouldAutoRefreshAiSuggestions("manual", "customer_message")).toBe(false);
    expect(shouldAutoRefreshAiSuggestions("on_open", "conversation_open")).toBe(true);
    expect(shouldAutoRefreshAiSuggestions("on_customer_message", "customer_message")).toBe(true);
  });

  it("passes realtime typing state to the chat window", () => {
    const source = readFileSync(new URL("./InboxPage.tsx", import.meta.url), "utf8");
    const chat = readFileSync(new URL("../components/conversations/ChatWindow.tsx", import.meta.url), "utf8");

    expect(source).toContain("isCustomerTyping");
    expect(source).toContain("chatEvents.agentTyping");
    expect(source).toContain("isCustomerTyping={isCustomerTyping}");
    expect(chat).toContain("isCustomerTyping");
    expect(chat).toContain("animate-bounce");
    expect(chat).toContain('aria-label="Người dùng đang nhập"');
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
