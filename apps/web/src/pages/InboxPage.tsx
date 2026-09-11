import * as React from "react";
import { useEffect, useState } from "react";
import { chatEvents, type AiSettingsContract, type AiSuggestionsResponse, type ChatMessageContract, type ConversationContract, type ConversationTagContract } from "@nhuu-chat/contracts";
import { apiRequest } from "../lib/api.js";
import { createChatSocket } from "../lib/socket.js";
import { resolveApiBaseUrl } from "../lib/api-url.js";
import { ConversationList } from "../components/conversations/ConversationList.js";
import { ChatWindow } from "../components/conversations/ChatWindow.js";
import { appendUniqueMessage, mergeMessages, upsertConversation } from "../state/inbox-realtime.js";
import { clampConversationListWidth, CONVERSATION_LIST_MAX_WIDTH, CONVERSATION_LIST_MIN_WIDTH, markConversationRead } from "../state/inbox-ui.js";
import { InboxIcon } from "../components/conversations/InboxIcon.js";
import { DashboardTopbar } from "../components/dashboard/DashboardTopbar.js";

const API_URL = resolveApiBaseUrl(import.meta.env.VITE_API_URL);
const CONVERSATION_TAGS_API_URL = "/api/v1/conversation-tags";
const AI_SETTINGS_API_URL = "/api/v1/ai-settings";
const DEFAULT_AI_SETTINGS: AiSettingsContract = { modelTier: "smart", enabled: true, suggestionsEnabled: true, sentimentEnabled: true, suggestionMode: "on_open", sentimentWindow: 3 };

export function shouldAutoRefreshAiSuggestions(
  mode: AiSettingsContract["suggestionMode"],
  trigger: "conversation_open" | "customer_message"
): boolean {
  return (trigger === "conversation_open" && mode === "on_open") ||
    (trigger === "customer_message" && mode === "on_customer_message");
}

// Tracks request identity and conversation identity so overlapping responses cannot cross conversation boundaries.
export function createAiSuggestionsRequestGuard() {
  let activeConversationId: string | null = null;
  let latestRequestId = 0;
  return {
    setActiveConversation(id: string | null) {
      if (id === activeConversationId) return;
      activeConversationId = id;
      latestRequestId += 1;
    },
    start(conversationId: string) {
      const requestId = ++latestRequestId;
      return () => requestId === latestRequestId && conversationId === activeConversationId;
    }
  };
}
export function InboxPage({ token, refresh, onBack, onLogoClick, onNavigate }: { token: string; refresh?: () => Promise<string | null>; onBack?: () => void; onLogoClick?: () => void; onNavigate?: (item: "Hội thoại" | "Đơn hàng" | "Bài viết" | "Thống kê" | "Cài đặt") => void }) {
  const [conversations, setConversations] = useState<ConversationContract[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageContract[]>([]);
  const [aiSuggestions, setAiSuggestions] = useState<AiSuggestionsResponse["suggestions"] | null>(null);
  const [isAiSuggestionsLoading, setIsAiSuggestionsLoading] = useState(false);
  const [aiSuggestionsError, setAiSuggestionsError] = useState<string | null>(null);
  const [aiSettings, setAiSettings] = useState<AiSettingsContract>(DEFAULT_AI_SETTINGS);
  const [aiSettingsLoaded, setAiSettingsLoaded] = useState(false);
  const [isCustomerTyping, setIsCustomerTyping] = useState(false);
  const [availableTags, setAvailableTags] = useState<ConversationTagContract[]>([]);
  const [isConversationListOpen, setIsConversationListOpen] = useState(false);
  const [conversationListWidth, setConversationListWidth] = useState(CONVERSATION_LIST_MAX_WIDTH);
  const isConversationListCollapsed = conversationListWidth <= CONVERSATION_LIST_MIN_WIDTH;
  const nextReadGenerationRef = React.useRef(0);
  const conversationRevisionRef = React.useRef(new Map<string, number>());
  const conversationsRef = React.useRef<ConversationContract[]>([]);
  const readStateRef = React.useRef(new Map<string, { generation: number; baseline: number; revision: number; confirmedGeneration?: number; confirmedRevision?: number }>());
  const aiSuggestionsGuardRef = React.useRef(createAiSuggestionsRequestGuard());
  aiSuggestionsGuardRef.current.setActiveConversation(activeId);
  const active = conversations.find((item) => item.id === activeId) ?? null;
  const aiSuggestionsEnabled = aiSettings.enabled && aiSettings.suggestionsEnabled;
  const [readRequestKey, setReadRequestKey] = useState(0);
  // Uses generation and revision guards so delayed read responses cannot undo newer realtime activity.
  async function markActiveRead(id: string) {
    const previousReadState = readStateRef.current.get(id);
    const currentRevision = conversationRevisionRef.current.get(id) ?? 0;
    const currentUnread = conversationsRef.current.find((item) => item.id === id)?.unreadCount ?? 0;
    const generation = ++nextReadGenerationRef.current;
    const readRevision = currentRevision + 1;
    conversationRevisionRef.current.set(id, readRevision);
    let baseline = currentUnread;
    if (previousReadState && previousReadState.confirmedGeneration === undefined && previousReadState.revision === currentRevision) baseline = previousReadState.baseline;
    readStateRef.current.set(id, { generation, baseline, revision: readRevision });
    setConversations((current) => {
      const next = current.map((item) => {
        if (item.id !== id) return item;
        return markConversationRead(item);
      });
      conversationsRef.current = next;
      return next;
    });
    try {
      await apiRequest<ConversationContract>(API_URL, `/api/v1/conversations/${id}/read`, token, { method: "PATCH" }, refresh);
      const readState = readStateRef.current.get(id);
      if (readState?.generation === generation && readState.revision === (conversationRevisionRef.current.get(id) ?? 0)) {
        readStateRef.current.delete(id);
        setConversations((current) => {
          const next = current.map((item) => item.id === id ? { ...item, unreadCount: 0 } : item);
          conversationsRef.current = next;
          return next;
        });
      }
    } catch {
      const readState = readStateRef.current.get(id);
      if (readState?.generation === generation && readState.revision === (conversationRevisionRef.current.get(id) ?? 0) && readState.confirmedGeneration !== generation) {
        const baseline = readState.baseline;
        readStateRef.current.delete(id);
        setConversations((current) => {
          const next = current.map((item) => item.id === id && item.unreadCount === 0 ? { ...item, unreadCount: baseline } : item);
          conversationsRef.current = next;
          return next;
        });
      }
    }
  }
  // Loads suggestions for only the visible conversation so stale responses cannot replace newer composer state.
  async function refreshAiSuggestions(id = activeId, trigger: "manual" | "conversation_open" | "customer_message" = "manual") {
    if (!id) return;
    if (!aiSuggestionsEnabled) {
      setAiSuggestions(null);
      return;
    }
    const isCurrentRequest = aiSuggestionsGuardRef.current.start(id);
    setIsAiSuggestionsLoading(true);
    setAiSuggestionsError(null);
    try {
      const result = await apiRequest<AiSuggestionsResponse>(API_URL, `/api/v1/conversations/${id}/ai-suggestions`, token, { method: "POST", body: JSON.stringify({ trigger }) }, refresh);
      if (isCurrentRequest()) setAiSuggestions(result.suggestions);
    } catch {
      if (isCurrentRequest()) setAiSuggestionsError("Không thể tải gợi ý AI.");
    } finally {
      if (isCurrentRequest()) setIsAiSuggestionsLoading(false);
    }
  }
  useEffect(() => {
    let cancelled = false;
    void apiRequest<{ conversations: ConversationContract[] }>(API_URL, "/api/v1/conversations", token, {}, refresh).then((result) => {
      if (cancelled) return;
      setConversations((current) => {
        const currentById = new Map(current.map((item) => [item.id, item]));
        const next = result.conversations.map((item) => {
          const latest = currentById.get(item.id);
          const hasNewerLocalState = (conversationRevisionRef.current.get(item.id) ?? 0) > 0 || readStateRef.current.has(item.id);
          return latest && hasNewerLocalState ? { ...item, ...latest } : item;
        });
        const resultIds = new Set(result.conversations.map((item) => item.id));
        next.push(...current.filter((item) => !resultIds.has(item.id)));
        conversationsRef.current = next;
        return next;
      });
      setActiveId((current) => current ?? result.conversations[0]?.id ?? null);
    });
    return () => { cancelled = true; };
  }, [token, refresh]);
  useEffect(() => {
    let cancelled = false;
    void apiRequest<{ tags: ConversationTagContract[] }>(API_URL, CONVERSATION_TAGS_API_URL, token, {}, refresh)
      .then((result) => { if (!cancelled) setAvailableTags(result.tags); })
      .catch(() => { if (!cancelled) setAvailableTags([]); });
    return () => { cancelled = true; };
  }, [token, refresh]);
  useEffect(() => {
    let cancelled = false;
    void apiRequest<AiSettingsContract>(API_URL, AI_SETTINGS_API_URL, token, {}, refresh)
      .then((settings) => { if (!cancelled) { setAiSettings(settings); setAiSettingsLoaded(true); } })
      .catch(() => { if (!cancelled) { setAiSettings(DEFAULT_AI_SETTINGS); setAiSettingsLoaded(true); } });
    return () => { cancelled = true; };
  }, [token, refresh]);
  useEffect(() => {
    if (!activeId) return;
    void markActiveRead(activeId);
  }, [activeId, readRequestKey, token, refresh]);
  useEffect(() => {
    if (!activeId) { setMessages([]); return; }
    let cancelled = false;
    setMessages([]);
    void apiRequest<{ messages: ChatMessageContract[] }>(API_URL, `/api/v1/conversations/${activeId}/messages`, token, {}, refresh)
      .then((result) => { if (!cancelled) setMessages((current) => mergeMessages(current, result.messages)); });
    return () => { cancelled = true; };
  }, [activeId, token, refresh]);
  useEffect(() => {
    setIsCustomerTyping(false);
    setAiSuggestions(null);
    setAiSuggestionsError(null);
    setIsAiSuggestionsLoading(false);
    if (activeId && aiSettingsLoaded && shouldAutoRefreshAiSuggestions(aiSettings.suggestionMode, "conversation_open")) {
      void refreshAiSuggestions(activeId, "conversation_open");
    }
  }, [activeId, token, refresh, aiSuggestionsEnabled, aiSettingsLoaded, aiSettings.suggestionMode]);
  useEffect(() => {
    const socket = createChatSocket(API_URL, token);
    const joinActiveRoom = () => { if (activeId) socket.emit(chatEvents.joinRoom, activeId); };
    socket.on("connect", joinActiveRoom);
    socket.on(chatEvents.messageReceived, (message: ChatMessageContract) => { const revision = (conversationRevisionRef.current.get(message.conversationId) ?? 0) + 1; conversationRevisionRef.current.set(message.conversationId, revision); if (message.conversationId === activeId) { setIsCustomerTyping(false); setMessages((current) => appendUniqueMessage(current, message)); void markActiveRead(activeId); if (message.senderType === "customer" && aiSettingsLoaded && shouldAutoRefreshAiSuggestions(aiSettings.suggestionMode, "customer_message")) void refreshAiSuggestions(activeId, "customer_message"); } });
    socket.on(chatEvents.agentTyping, (payload: { conversationId?: unknown; isTyping?: unknown }) => {
      if (payload.conversationId !== activeId) return;
      setIsCustomerTyping(payload.isTyping === true);
    });
    socket.on(chatEvents.conversationUpdated, (conversation: ConversationContract) => {
      const revision = (conversationRevisionRef.current.get(conversation.id) ?? 0) + 1;
      conversationRevisionRef.current.set(conversation.id, revision);
      const readState = readStateRef.current.get(conversation.id);
      if (conversation.unreadCount === 0 && readState) readStateRef.current.set(conversation.id, { ...readState, baseline: 0, revision, confirmedGeneration: readState.generation, confirmedRevision: revision });
      setConversations((current) => {
        const next = upsertConversation(current, conversation);
        conversationsRef.current = next;
        return next;
      });
      setActiveId((current) => current ?? conversation.id);
      if (conversation.id === activeId && conversation.unreadCount > 0) void markActiveRead(conversation.id);
    });
    joinActiveRoom();
    return () => { socket.off("connect", joinActiveRoom); socket.disconnect(); };
  }, [token, activeId, aiSettingsLoaded, aiSettings.suggestionMode, aiSuggestionsEnabled]);
  function selectConversation(id: string) { setActiveId(id); setReadRequestKey((current) => current + 1); setIsConversationListOpen(false); }
  async function updateConversationTags(id: string, tags: ConversationTagContract[]) {
    const previous = conversationsRef.current.find((item) => item.id === id)?.tags ?? [];
    setConversations((current) => {
      const next = current.map((item) => item.id === id ? { ...item, tags } : item);
      conversationsRef.current = next;
      return next;
    });
    try {
      const result = await apiRequest<ConversationContract>(API_URL, `/api/v1/conversations/${id}/tags`, token, { method: "PUT", body: JSON.stringify({ tagIds: tags.map((tag) => tag.id) }) }, refresh);
      setConversations((current) => {
        const next = current.map((item) => item.id === id ? { ...item, tags: result.tags ?? tags } : item);
        conversationsRef.current = next;
        return next;
      });
    } catch (error) {
      setConversations((current) => {
        const next = current.map((item) => item.id === id ? { ...item, tags: previous } : item);
        conversationsRef.current = next;
        return next;
      });
      throw error;
    }
  }
  async function sendText(content: string) { if (!activeId) return; const message = await apiRequest<ChatMessageContract>(API_URL, "/api/v1/messages/send", token, { method: "POST", body: JSON.stringify({ conversationId: activeId, type: "text", content }) }, refresh); setMessages((current) => appendUniqueMessage(current, message)); }
  function handleConversationListResizeStart(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = conversationListWidth;
    const onPointerMove = (moveEvent: PointerEvent) => setConversationListWidth(clampConversationListWidth(startWidth + moveEvent.clientX - startX));
    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
  }
  return <main className="inbox-shell"><div className="flex h-screen min-h-0 flex-col overflow-hidden bg-slate-100"><DashboardTopbar onLogoClick={onLogoClick} onNavigate={onNavigate} /><div className="inbox-page grid min-h-0 flex-1 grid-cols-[44px_var(--conversation-list-width)_minmax(0,1fr)] overflow-hidden bg-slate-100 text-gray-800 transition-[grid-template-columns] duration-200 max-[900px]:grid-cols-[44px_minmax(0,1fr)]" style={{ "--conversation-list-width": `${conversationListWidth}px` } as React.CSSProperties}><aside className="inbox-nav flex flex-col items-center gap-3 bg-blue-600 px-1 py-3" aria-label="Thanh điều hướng"><div className="inbox-nav-logo mb-2 grid size-[30px] place-items-center rounded-lg border border-white/70 text-[17px] font-bold text-white">H</div><button className="inbox-nav-item grid size-9 place-items-center rounded-lg bg-black/15 text-white transition-colors hover:bg-black/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300" type="button" aria-label="Hội thoại"><InboxIcon name="chat" /></button><button className="inbox-nav-item grid size-9 place-items-center rounded-lg text-white/80 transition-colors hover:bg-black/15 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300" type="button" aria-label="Hộp thư"><InboxIcon name="inbox" /></button><button className="inbox-nav-item grid size-9 place-items-center rounded-lg text-white/80 transition-colors hover:bg-black/15 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300" type="button" aria-label="Khách hàng"><InboxIcon name="users" /></button><div className="inbox-nav-spacer flex-1" /><button className="inbox-nav-item grid size-9 place-items-center rounded-lg text-white/80 transition-colors hover:bg-black/15 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300" type="button" aria-label="Trợ giúp"><InboxIcon name="help" /></button><button className="inbox-nav-item grid size-9 place-items-center rounded-lg text-white/80 transition-colors hover:bg-black/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300" type="button" aria-label="Cài đặt"><InboxIcon name="settings" /></button>{onBack && <button className="inbox-nav-item grid size-9 place-items-center rounded-lg text-white/80 transition-colors hover:bg-black/15 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300" type="button" aria-label="Về Dashboard" onClick={onBack}>←</button>}</aside><div className="min-h-0 max-[899px]:hidden"><ConversationList items={conversations} activeId={activeId} onSelect={selectConversation} availableTags={availableTags} onTagsChange={updateConversationTags} collapsed={isConversationListCollapsed} onResizeStart={handleConversationListResizeStart} /></div><ChatWindow conversation={active} messages={messages} onSend={sendText} onOpenConversationList={() => setIsConversationListOpen(true)} isCustomerTyping={isCustomerTyping} aiSuggestions={aiSuggestions} isAiSuggestionsLoading={isAiSuggestionsLoading} aiSuggestionsError={aiSuggestionsError} onRefreshAiSuggestions={refreshAiSuggestions} aiSuggestionsEnabled={aiSuggestionsEnabled} />{isConversationListOpen && <><button className="fixed inset-0 z-40 bg-slate-900/30 min-[900px]:hidden" type="button" onClick={() => setIsConversationListOpen(false)} aria-label="Đóng danh sách hội thoại" /><div className="fixed inset-y-0 left-[44px] z-50 flex w-[min(395px,calc(100vw-44px))] min-[900px]:hidden"><ConversationList items={conversations} activeId={activeId} onSelect={selectConversation} availableTags={availableTags} onTagsChange={updateConversationTags} /></div></>}</div></div></main>;
}
