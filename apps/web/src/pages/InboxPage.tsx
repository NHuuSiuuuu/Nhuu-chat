import * as React from "react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useLocation, useNavigate } from "react-router-dom";
import { chatEvents, type AiSettingsContract, type AiSuggestionsResponse, type ChatMessageContract, type ConversationContract, type ConversationPinEventPayload, type ConversationTagContract, type GeneralSettingsContract, type QuickReplyContract } from "@nhuu-chat/contracts";
import { apiRequest } from "../lib/api.js";
import { createChatSocket } from "../lib/socket.js";
import { resolveApiBaseUrl } from "../lib/api-url.js";
import { facebookSafeApiErrorMessage } from "../lib/facebook-publishing.api.js";
import { ConversationList } from "../components/conversations/ConversationList.js";
import { ChatWindow } from "../components/conversations/ChatWindow.js";
import type { ComposerSendPayload } from "../components/conversations/MessageComposer.js";
import { appendUniqueMessage, mergeMessages, upsertConversation } from "../state/inbox-realtime.js";
import { applyPinnedMessagesEvent, createPinnedMessagesRequestGuard, findPinnedMessage, getPinnedMessagesForConversation, replacePinnedMessages, type ConversationPinnedMessagesState } from "../state/inbox-pins.js";
import { clampConversationListWidth, CONVERSATION_LIST_MAX_WIDTH, CONVERSATION_LIST_MIN_WIDTH, markConversationRead } from "../state/inbox-ui.js";
import { getNextUnreadConversationId, getNotificationSoundTones, orderConversationsByUnread, shouldNotifyForIncomingMessage } from "../state/general-settings.js";
import { loadGeneralSettings } from "../components/settings/general-settings.js";
import { InboxIcon } from "../components/conversations/InboxIcon.js";
import { ConversationAvatar } from "../components/conversations/ConversationAvatar.js";
import { DashboardTopbar, type DashboardAccount } from "../components/dashboard/DashboardTopbar.js";
import { PlatformIcon } from "../components/dashboard/PlatformIcon.js";
import type { ConnectionProviderId } from "../state/dashboard-ui.js";

const API_URL = resolveApiBaseUrl(import.meta.env.VITE_API_URL);
const CONVERSATION_TAGS_API_URL = "/api/v1/conversation-tags";
const AI_SETTINGS_API_URL = "/api/v1/ai-settings";
const QUICK_REPLIES_API_URL = "/api/v1/quick-replies";
const DEFAULT_GENERAL_SETTINGS: GeneralSettingsContract = { browserNotificationsEnabled: true, notificationSound: "default", moveUnreadConversationsToTop: true, openNextUnreadConversation: false };
const DEFAULT_AI_SETTINGS: AiSettingsContract = { modelTier: "smart", enabled: true, suggestionsEnabled: true, sentimentEnabled: true, suggestionMode: "on_open", sentimentWindow: 3 };

function playIncomingNotificationSound(sound: GeneralSettingsContract["notificationSound"]): void {
  const tones = getNotificationSoundTones(sound);
  if (!tones || typeof AudioContext === "undefined") return;
  try {
    const context = new AudioContext();
    let startAt = context.currentTime;
    for (const tone of tones) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = tone.frequency;
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(0.12, startAt + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + tone.durationMs / 1000);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(startAt);
      oscillator.stop(startAt + tone.durationMs / 1000);
      startAt += tone.durationMs / 1000 + 0.07;
    }
    window.setTimeout(() => { void context.close().catch(() => undefined); }, Math.max(250, (startAt - context.currentTime) * 1000));
  } catch {
    // Autoplay restrictions must not interfere with realtime message handling.
  }
}

function platformIconProvider(platform: ChatMessageContract["platform"]): ConnectionProviderId {
  return platform === "telegram_personal" ? "telegram" : platform === "zalo_personal" ? "zalo" : platform;
}

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

export function createQuickRepliesRequestGuard() {
  let latestRequestId = 0;
  return {
    start() {
      const requestId = ++latestRequestId;
      return () => requestId === latestRequestId;
    },
    cancel() {
      latestRequestId += 1;
    }
  };
}

export function getConversationDraft(drafts: Record<string, string>, conversationId: string | null): string {
  return conversationId ? drafts[conversationId] ?? "" : "";
}

export function setConversationDraft(drafts: Record<string, string>, conversationId: string, content: string): Record<string, string> {
  return { ...drafts, [conversationId]: content };
}

export function buildConversationListRequestPath(platform?: string, channelId?: string): string {
  const query = new URLSearchParams();
  if (platform) query.set("platform", platform);
  if (channelId) query.set("channelId", channelId);
  return query.size > 0 ? `/api/v1/conversations?${query.toString()}` : "/api/v1/conversations";
}

export function facebookMessengerSendErrorMessage(code: string | undefined): string {
  return facebookSafeApiErrorMessage(code) ?? "Chưa gửi được tin nhắn Messenger. Hãy thử lại sau.";
}

export function createOptimisticMessage(conversation: ConversationContract, payload: ComposerSendPayload, clientMessageId: string, createdAt = new Date().toISOString(), attachmentUrl?: string): ChatMessageContract {
  const attachment = typeof payload === "string" ? undefined : {
    url: attachmentUrl ?? "",
    fileName: payload.attachment.name,
    mimeType: payload.attachment.type || "application/octet-stream"
  };
  return {
    id: `optimistic:${clientMessageId}`,
    clientMessageId,
    conversationId: conversation.id,
    platform: conversation.platform,
    senderType: "agent",
    senderId: "agent",
    type: typeof payload === "string" ? "text" : payload.attachment.type.startsWith("image/") ? "image" : "file",
    content: typeof payload === "string" ? payload : payload.content,
    ...(attachment ? { attachments: [attachment] } : {}),
    deliveryStatus: "pending",
    createdAt
  };
}

export function createClientMessageId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `client-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function setMessageDeliveryStatus(messages: ChatMessageContract[], messageId: string, deliveryStatus: ChatMessageContract["deliveryStatus"]): ChatMessageContract[] {
  return messages.map((message) => message.id === messageId ? { ...message, deliveryStatus } : message);
}

// Chỉ áp dụng kết quả của lần tải mẫu còn hiệu lực để auth context cũ không ghi đè state mới.
export async function loadInboxQuickReplies(request: () => Promise<{ quickReplies: QuickReplyContract[] }>, apply: (quickReplies: QuickReplyContract[]) => void, isCurrent: () => boolean): Promise<void> {
  try {
    const result = await request();
    if (isCurrent()) apply(result.quickReplies);
  } catch {
    if (isCurrent()) apply([]);
  }
}

type InboxAccount = DashboardAccount & { id?: string };
type RetryPayloadEntry = { conversationId: string; payload: ComposerSendPayload; previewUrl?: string };

export function InboxPage({ token, refresh, platform, channelId, selectedConversationId, selectedConversationRequest, onBack, onLogoClick, onNavigate, user, onLogout, onProfile }: { token: string; refresh?: () => Promise<string | null>; platform?: string; channelId?: string; selectedConversationId?: string | null; selectedConversationRequest?: number; onBack?: () => void; onLogoClick?: () => void; onNavigate?: (item: "Hộp thư" | "Đơn hàng" | "Bài viết" | "Thống kê" | "Cài đặt") => void; user?: InboxAccount | null; onLogout?: () => void; onProfile?: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<ConversationContract[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageContract[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [pinnedMessagesState, setPinnedMessagesState] = useState<ConversationPinnedMessagesState>({ conversationId: null, pinnedMessages: [] });
  const [pinnedMessagesError, setPinnedMessagesError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [aiSuggestions, setAiSuggestions] = useState<AiSuggestionsResponse["suggestions"] | null>(null);
  const [isAiSuggestionsLoading, setIsAiSuggestionsLoading] = useState(false);
  const [aiSuggestionsError, setAiSuggestionsError] = useState<string | null>(null);
  const [aiSettings, setAiSettings] = useState<AiSettingsContract>(DEFAULT_AI_SETTINGS);
  const [aiSettingsLoaded, setAiSettingsLoaded] = useState(false);
  const [generalSettings, setGeneralSettings] = useState<GeneralSettingsContract>(DEFAULT_GENERAL_SETTINGS);
  const [generalSettingsLoaded, setGeneralSettingsLoaded] = useState(false);
  const [generalSettingsToken, setGeneralSettingsToken] = useState<string | null>(null);
  const [isCustomerTyping, setIsCustomerTyping] = useState(false);
  const [availableTags, setAvailableTags] = useState<ConversationTagContract[]>([]);
  const [quickReplies, setQuickReplies] = useState<QuickReplyContract[]>([]);
  const [isConversationListLoading, setIsConversationListLoading] = useState(true);
  const [isConversationListOpen, setIsConversationListOpen] = useState(false);
  const [isTakingOver, setIsTakingOver] = useState(false);
  const [takeoverError, setTakeoverError] = useState<string | null>(null);
  const [conversationListWidth, setConversationListWidth] = useState(CONVERSATION_LIST_MAX_WIDTH);
  const isConversationListCollapsed = conversationListWidth <= CONVERSATION_LIST_MIN_WIDTH;
  const nextReadGenerationRef = React.useRef(0);
  const conversationRevisionRef = React.useRef(new Map<string, number>());
  const conversationsRef = React.useRef<ConversationContract[]>([]);
  const readStateRef = React.useRef(new Map<string, { generation: number; baseline: number; revision: number; confirmedGeneration?: number; confirmedRevision?: number }>());
  const aiSuggestionsGuardRef = React.useRef(createAiSuggestionsRequestGuard());
  const pinnedMessagesGuardRef = React.useRef(createPinnedMessagesRequestGuard());
  const quickRepliesGuardRef = React.useRef(createQuickRepliesRequestGuard());
  const retryPayloadsRef = React.useRef(new Map<string, RetryPayloadEntry>());
  const optimisticMessageIdsRef = React.useRef(new Map<string, string>());
  const incomingToastIdsRef = React.useRef<string[]>([]);
  const handledRequestedConversationRef = React.useRef<number | null>(null);
  const notifiedMessageIdsRef = React.useRef<string[]>([]);
  aiSuggestionsGuardRef.current.setActiveConversation(activeId);
  pinnedMessagesGuardRef.current.setActiveConversation(activeId);
  const pinnedMessages = getPinnedMessagesForConversation(pinnedMessagesState, activeId);
  const active = conversations.find((item) => item.id === activeId) ?? null;
  const hasCurrentGeneralSettings = generalSettingsLoaded && generalSettingsToken === token;
  const orderedConversations = orderConversationsByUnread(conversations, hasCurrentGeneralSettings && generalSettings.moveUnreadConversationsToTop);
  (globalThis as typeof globalThis & { __nhuuChatConversationContext?: { id: string | null; token: string; refresh?: () => Promise<string | null> } }).__nhuuChatConversationContext = { id: activeId, token, refresh };
  const aiSuggestionsEnabled = aiSettings.enabled && aiSettings.suggestionsEnabled;
  const [readRequestKey, setReadRequestKey] = useState(0);
  function releaseRetryPayload(messageId: string) {
    const entry = retryPayloadsRef.current.get(messageId);
    if (entry?.previewUrl && typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(entry.previewUrl);
    retryPayloadsRef.current.delete(messageId);
  }
  function forgetOptimisticMessage(messageId: string) {
    for (const [clientMessageId, optimisticId] of optimisticMessageIdsRef.current) {
      if (optimisticId === messageId) optimisticMessageIdsRef.current.delete(clientMessageId);
    }
  }
  useEffect(() => () => {
    for (const messageId of retryPayloadsRef.current.keys()) releaseRetryPayload(messageId);
  }, []);
  // Uses generation and revision guards so delayed read responses cannot undo newer realtime activity.
  async function markActiveRead(id: string): Promise<boolean> {
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
      return true;
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
      return false;
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
    setIsConversationListLoading(true);
    void apiRequest<{ conversations: ConversationContract[] }>(API_URL, buildConversationListRequestPath(platform, channelId), token, {}, refresh).then((result) => {
      if (cancelled) return;
      setConversations((current) => {
        const currentById = new Map(current.map((item) => [item.id, item]));
        const next = result.conversations.map((item) => {
          const latest = currentById.get(item.id);
          const hasNewerLocalState = (conversationRevisionRef.current.get(item.id) ?? 0) > 0 || readStateRef.current.has(item.id);
          return latest && hasNewerLocalState ? { ...item, ...latest } : item;
        });
        const resultIds = new Set(result.conversations.map((item) => item.id));
        next.push(...current.filter((item) => !resultIds.has(item.id) && (!channelId || (item.platform === platform && item.channelId === channelId))));
        conversationsRef.current = next;
        return next;
      });
    }).catch(() => {
      // Giữ danh sách rỗng sau lỗi tải; trạng thái loading vẫn phải kết thúc để hiển thị empty state.
    }).finally(() => {
      if (!cancelled) setIsConversationListLoading(false);
    });
    return () => { cancelled = true; };
  }, [platform, channelId, token, refresh]);
  useEffect(() => {
    if (!selectedConversationId || selectedConversationRequest === undefined || isConversationListLoading || handledRequestedConversationRef.current === selectedConversationRequest) return;
    if (!conversations.some((conversation) => conversation.id === selectedConversationId)) return;
    handledRequestedConversationRef.current = selectedConversationRequest;
    selectConversation(selectedConversationId);
    const params = new URLSearchParams(location.search);
    params.delete("conversationId");
    navigate({ pathname: location.pathname, search: params.toString() ? `?${params.toString()}` : "" }, { replace: true });
  }, [conversations, isConversationListLoading, location.pathname, location.search, navigate, selectedConversationId, selectedConversationRequest]);
  useEffect(() => {
    let cancelled = false;
    void apiRequest<{ tags: ConversationTagContract[] }>(API_URL, CONVERSATION_TAGS_API_URL, token, {}, refresh)
      .then((result) => { if (!cancelled) setAvailableTags(result.tags); })
      .catch(() => { if (!cancelled) setAvailableTags([]); });
    return () => { cancelled = true; };
  }, [token, refresh]);
  useEffect(() => {
    const isCurrent = quickRepliesGuardRef.current.start();
    void loadInboxQuickReplies(() => apiRequest<{ quickReplies: QuickReplyContract[] }>(API_URL, QUICK_REPLIES_API_URL, token, {}, refresh), setQuickReplies, isCurrent);
    return () => { quickRepliesGuardRef.current.cancel(); };
  }, [token, refresh]);
  useEffect(() => {
    let cancelled = false;
    void apiRequest<AiSettingsContract>(API_URL, AI_SETTINGS_API_URL, token, {}, refresh)
      .then((settings) => { if (!cancelled) { setAiSettings(settings); setAiSettingsLoaded(true); } })
      .catch(() => { if (!cancelled) { setAiSettings(DEFAULT_AI_SETTINGS); setAiSettingsLoaded(true); } });
    return () => { cancelled = true; };
  }, [token, refresh]);
  useEffect(() => {
    let cancelled = false;
    setGeneralSettingsLoaded(false);
    setGeneralSettingsToken(null);
    setGeneralSettings(DEFAULT_GENERAL_SETTINGS);
    void loadGeneralSettings({ apiUrl: API_URL, token, refresh })
      .then((settings) => { if (!cancelled) { setGeneralSettings(settings); setGeneralSettingsToken(token); setGeneralSettingsLoaded(true); } })
      .catch(() => { if (!cancelled) { setGeneralSettings(DEFAULT_GENERAL_SETTINGS); setGeneralSettingsToken(token); setGeneralSettingsLoaded(true); } });
    return () => { cancelled = true; };
  }, [token, refresh]);
  useEffect(() => {
    if (!activeId) return;
    void markActiveRead(activeId);
  }, [activeId, readRequestKey, token, refresh]);
  useEffect(() => {
    if (!activeId) { setMessages([]); setIsLoadingMessages(false); return; }
    let cancelled = false;
    setMessages([]);
    setIsLoadingMessages(true);
    void apiRequest<{ messages: ChatMessageContract[] }>(API_URL, `/api/v1/conversations/${activeId}/messages`, token, {}, refresh)
      .then((result) => { if (!cancelled) setMessages((current) => mergeMessages(current, result.messages)); })
      .finally(() => { if (!cancelled) setIsLoadingMessages(false); });
    return () => { cancelled = true; };
  }, [activeId, token, refresh]);
  useEffect(() => {
    setPinnedMessagesState({ conversationId: activeId, pinnedMessages: [] });
    setPinnedMessagesError(null);
    if (!activeId) return;
    const isCurrentRequest = pinnedMessagesGuardRef.current.startLoad(activeId);
    void apiRequest<ConversationPinEventPayload>(API_URL, `/api/v1/conversations/${activeId}/pins`, token, {}, refresh)
      .then((result) => {
        if (isCurrentRequest()) setPinnedMessagesState({ conversationId: activeId, pinnedMessages: replacePinnedMessages([], result.pinnedMessages) });
      })
      .catch(() => {
        if (isCurrentRequest()) setPinnedMessagesError("Không thể tải danh sách tin nhắn ghim.");
      });
    return () => { pinnedMessagesGuardRef.current.invalidateLoad(); };
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
    const handleMessagePinUpdated = (payload: ConversationPinEventPayload) => {
      if (payload.conversationId !== activeId) return;
      pinnedMessagesGuardRef.current.invalidateLoad();
      setPinnedMessagesState((current) => ({
        conversationId: activeId,
        pinnedMessages: applyPinnedMessagesEvent(getPinnedMessagesForConversation(current, activeId), activeId, payload)
      }));
      setPinnedMessagesError(null);
    };
    socket.on(chatEvents.messageReceived, (message: ChatMessageContract) => {
      const revision = (conversationRevisionRef.current.get(message.conversationId) ?? 0) + 1;
      conversationRevisionRef.current.set(message.conversationId, revision);
      if (message.clientMessageId) {
        const optimisticId = optimisticMessageIdsRef.current.get(message.clientMessageId);
        if (optimisticId) {
          releaseRetryPayload(optimisticId);
          optimisticMessageIdsRef.current.delete(message.clientMessageId);
        }
      }
      if (hasCurrentGeneralSettings && shouldNotifyForIncomingMessage(generalSettings, message.senderType) && !notifiedMessageIdsRef.current.includes(message.id)) {
        notifiedMessageIdsRef.current = [...notifiedMessageIdsRef.current, message.id].slice(-100);
        const conversation = conversationsRef.current.find((item) => item.id === message.conversationId);
        const senderName = message.senderName?.trim() || conversation?.customerName?.trim() || "Khách hàng";
        if (generalSettings.notificationSound !== "off") playIncomingNotificationSound(generalSettings.notificationSound);
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          try { new Notification(senderName, { body: message.content || "Đã gửi một tin nhắn mới" }); } catch { /* Browser notification is best effort. */ }
        }
        if (!incomingToastIdsRef.current.includes(message.id)) {
          const previousToastId = incomingToastIdsRef.current.length >= 3 ? incomingToastIdsRef.current[0] : undefined;
          if (previousToastId) {
            toast.dismiss(previousToastId);
            removeIncomingToast(previousToastId);
          }
          incomingToastIdsRef.current = [...incomingToastIdsRef.current, message.id].slice(-3);
          toast.custom((toastId) => <button className="flex w-[min(380px,calc(100vw-2rem))] items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left text-slate-800 shadow-xl transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 cursor-pointer" type="button" onClick={() => { selectConversation(message.conversationId); toast.dismiss(toastId); removeIncomingToast(message.id); }}>
            <ConversationAvatar name={senderName} avatarUrl={conversationsRef.current.find((item) => item.id === message.conversationId)?.customerAvatarUrl} size="size-12" />
            <span className="min-w-0 flex-1"><span className="flex items-center gap-2"><strong className="truncate text-sm">{senderName}</strong><PlatformIcon provider={platformIconProvider(message.platform)} size={16} plain /></span><span className="mt-1 block truncate text-xs text-slate-600">{message.content || "Đã gửi một tin nhắn mới"}</span></span>
          </button>, { id: message.id, duration: 5000, onDismiss: () => removeIncomingToast(message.id), onAutoClose: () => removeIncomingToast(message.id) });
        }
      }
      if (message.conversationId === activeId) {
        setIsCustomerTyping(false);
        setMessages((current) => appendUniqueMessage(current, message));
        void markActiveRead(activeId);
        if (message.senderType === "customer" && aiSettingsLoaded && shouldAutoRefreshAiSuggestions(aiSettings.suggestionMode, "customer_message")) void refreshAiSuggestions(activeId, "customer_message");
      }
    });
    socket.on("connect", joinActiveRoom);
    socket.on(chatEvents.messagePinUpdated, handleMessagePinUpdated);
    socket.on(chatEvents.agentTyping, (payload: { conversationId?: unknown; isTyping?: unknown }) => {
      if (payload.conversationId !== activeId) return;
      setIsCustomerTyping(payload.isTyping === true);
    });
    socket.on(chatEvents.conversationUpdated, (conversation: ConversationContract) => {
      if (channelId && (conversation.platform !== platform || conversation.channelId !== channelId)) return;
      const revision = (conversationRevisionRef.current.get(conversation.id) ?? 0) + 1;
      conversationRevisionRef.current.set(conversation.id, revision);
      const readState = readStateRef.current.get(conversation.id);
      if (conversation.unreadCount === 0 && readState) readStateRef.current.set(conversation.id, { ...readState, baseline: 0, revision, confirmedGeneration: readState.generation, confirmedRevision: revision });
      const updatedConversations = upsertConversation(conversationsRef.current, conversation);
      conversationsRef.current = updatedConversations;
      setConversations(updatedConversations);
      if (conversation.id === activeId && conversation.unreadCount > 0) void markActiveRead(conversation.id);
    });
    joinActiveRoom();
    return () => { socket.off("connect", joinActiveRoom); socket.off(chatEvents.messagePinUpdated, handleMessagePinUpdated); socket.disconnect(); };
  }, [token, platform, channelId, activeId, aiSettingsLoaded, aiSettings.suggestionMode, aiSuggestionsEnabled, generalSettings, hasCurrentGeneralSettings]);
  function selectConversation(id: string) { setActiveId(id); setReadRequestKey((current) => current + 1); setIsConversationListOpen(false); }
  async function openNextUnreadConversation() {
    if (!activeId || !await markActiveRead(activeId)) return;
    const unreadOrdered = orderConversationsByUnread(conversationsRef.current, hasCurrentGeneralSettings && generalSettings.moveUnreadConversationsToTop);
    const nextUnreadId = getNextUnreadConversationId(unreadOrdered, activeId);
    if (nextUnreadId) selectConversation(nextUnreadId);
  }
  function removeIncomingToast(id: string) {
    incomingToastIdsRef.current = incomingToastIdsRef.current.filter((toastId) => toastId !== id);
  }
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
  async function updateActiveConversationTags(tags: ConversationTagContract[]) {
    if (activeId) await updateConversationTags(activeId, tags);
  }
  async function pinActiveMessage(messageId: string): Promise<void> {
    if (!activeId) return;
    const conversationId = activeId;
    const isActiveMutation = pinnedMessagesGuardRef.current.startMutation(conversationId);
    setPinnedMessagesError(null);
    try {
      const result = await apiRequest<ConversationPinEventPayload>(API_URL, `/api/v1/conversations/${conversationId}/pins`, token, { method: "POST", body: JSON.stringify({ messageId }) }, refresh);
      if (isActiveMutation()) setPinnedMessagesState({ conversationId, pinnedMessages: replacePinnedMessages([], result.pinnedMessages) });
    } catch {
      if (isActiveMutation()) setPinnedMessagesError("Không thể ghim tin nhắn.");
    }
  }
  async function unpinActiveMessage(messageId: string): Promise<void> {
    if (!activeId) return;
    const conversationId = activeId;
    const isActiveMutation = pinnedMessagesGuardRef.current.startMutation(conversationId);
    setPinnedMessagesError(null);
    try {
      const result = await apiRequest<ConversationPinEventPayload>(API_URL, `/api/v1/conversations/${conversationId}/pins/${encodeURIComponent(messageId)}`, token, { method: "DELETE" }, refresh);
      if (isActiveMutation()) setPinnedMessagesState({ conversationId, pinnedMessages: replacePinnedMessages([], result.pinnedMessages) });
    } catch {
      if (isActiveMutation()) setPinnedMessagesError("Không thể bỏ ghim tin nhắn.");
    }
  }
  // Đồng bộ công tắc bot với backend để takeover tắt tự động trả lời theo hội thoại.
  async function toggleActiveBot() {
    if (!activeId || !active || isTakingOver) return;
    setIsTakingOver(true);
    setTakeoverError(null);
    try {
      const botEnabled = active.botEnabled === false;
      const result = await apiRequest<ConversationContract>(API_URL, `/api/v1/conversations/${activeId}/bot`, token, { method: "PATCH", body: JSON.stringify({ botEnabled }) }, refresh);
      setConversations((current) => {
        const next = upsertConversation(current, result);
        conversationsRef.current = next;
        return next;
      });
    } catch {
      setTakeoverError("Không thể cập nhật trạng thái bot.");
    } finally {
      setIsTakingOver(false);
    }
  }
  async function sendText(initialPayload: ComposerSendPayload, retryMessageId?: string): Promise<boolean> {
    if (!activeId || !active) return false;
    if (active.platform === "facebook" && typeof initialPayload !== "string") {
      toast.error("Messenger hiện chỉ hỗ trợ gửi tin nhắn văn bản.");
      return false;
    }
    const conversationId = activeId;
    const retryEntry = retryMessageId ? retryPayloadsRef.current.get(retryMessageId) : undefined;
    const retryPayload = retryEntry?.payload ?? initialPayload;
    const payload = retryPayload;
    if (retryMessageId) {
      retryPayloadsRef.current.delete(retryMessageId);
      forgetOptimisticMessage(retryMessageId);
    }
    const clientMessageId = createClientMessageId();
    const previewUrl = retryEntry?.previewUrl ?? (typeof retryPayload === "string" || typeof URL.createObjectURL !== "function" ? undefined : URL.createObjectURL(retryPayload.attachment));
    const optimisticMessage = createOptimisticMessage(active, retryPayload, clientMessageId, retryEntry ? (messages.find((item) => item.id === retryMessageId)?.createdAt ?? new Date().toISOString()) : new Date().toISOString(), previewUrl);
    retryPayloadsRef.current.set(optimisticMessage.id, { conversationId, payload: retryPayload, ...(previewUrl ? { previewUrl } : {}) });
    optimisticMessageIdsRef.current.set(clientMessageId, optimisticMessage.id);
    setMessages((current) => retryMessageId
      ? current.map((message) => message.id === retryMessageId ? optimisticMessage : message)
      : appendUniqueMessage(current, optimisticMessage));
    const content = typeof payload === "string" ? payload : payload.content;
    const formData = new FormData();
    formData.append("conversationId", conversationId);
    formData.append("type", typeof payload === "string" ? "text" : payload.attachment.type.startsWith("image/") ? "image" : "file");
    formData.append("content", content);
    formData.append("clientMessageId", clientMessageId);
    if (typeof payload !== "string") formData.append("attachment", payload.attachment);
    try {
      const message = await apiRequest<ChatMessageContract>(API_URL, "/api/v1/messages/send", token, { method: "POST", body: formData }, refresh);
      setMessages((current) => appendUniqueMessage(current, message));
      releaseRetryPayload(optimisticMessage.id);
      optimisticMessageIdsRef.current.delete(clientMessageId);
      setDrafts((current) => setConversationDraft(current, conversationId, ""));
      return true;
    } catch (requestError) {
      setMessages((current) => setMessageDeliveryStatus(current, optimisticMessage.id, "failed"));
      if (active.platform === "facebook") {
        const code = requestError && typeof requestError === "object" && "code" in requestError && typeof requestError.code === "string" ? requestError.code : undefined;
        toast.error(facebookMessengerSendErrorMessage(code));
      }
      return false;
    }
  }
  function retryMessage(messageId: string) {
    const entry = retryPayloadsRef.current.get(messageId);
    if (entry?.conversationId === activeId) void sendText(entry.payload, messageId);
  }
  function updateActiveDraft(content: string) { if (activeId) setDrafts((current) => setConversationDraft(current, activeId, content)); }
  const chatWindowPinProps = {
    pinnedMessages,
    isPinned: (messageId: string) => Boolean(findPinnedMessage(pinnedMessages, messageId)),
    onPinMessage: pinActiveMessage,
    onUnpinMessage: unpinActiveMessage,
    pinError: pinnedMessagesError
  };
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
  return <main className="inbox-shell"><div className="flex h-screen min-h-0 flex-col overflow-hidden bg-slate-100"><DashboardTopbar onLogoClick={onLogoClick} onNavigate={onNavigate} user={user} onLogout={onLogout} onProfile={onProfile} /><div className="inbox-page grid min-h-0 flex-1 grid-cols-[44px_var(--conversation-list-width)_minmax(0,1fr)] overflow-hidden bg-slate-100 text-gray-800 transition-[grid-template-columns] duration-200 max-[900px]:grid-cols-[44px_minmax(0,1fr)]" style={{ "--conversation-list-width": `${conversationListWidth}px` } as React.CSSProperties}><aside className="inbox-nav flex flex-col items-center gap-3 bg-blue-600 px-1 py-3" aria-label="Thanh điều hướng">
    <button className="inbox-nav-item grid size-9 place-items-center rounded-lg bg-black/15 text-white transition-colors hover:bg-black/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300 cursor-pointer" type="button" aria-label="Hội thoại"><InboxIcon name="chat" /></button>
    <button className="inbox-nav-item grid size-9 place-items-center rounded-lg text-white/80 transition-colors hover:bg-black/15 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300 cursor-pointer" type="button" aria-label="Hộp thư"><InboxIcon name="inbox" /></button>
    {/* <button className="inbox-nav-item grid size-9 place-items-center rounded-lg text-white/80 transition-colors hover:bg-black/15 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300" type="button" aria-label="Khách hàng"><InboxIcon name="users" /></button><div className="inbox-nav-spacer flex-1" /><button className="inbox-nav-item grid size-9 place-items-center rounded-lg text-white/80 transition-colors hover:bg-black/15 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300" type="button" aria-label="Trợ giúp"><InboxIcon name="help" /></button><button className="inbox-nav-item grid size-9 place-items-center rounded-lg text-white/80 transition-colors hover:bg-black/15 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300" type="button" aria-label="Cài đặt"><InboxIcon name="settings" /></button> */}
    {/* {onBack && <button className="inbox-nav-item grid size-9 place-items-center rounded-lg text-white/80 transition-colors hover:bg-gray-100 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300" type="button" aria-label="Về Dashboard" onClick={onBack}>←</button>} */}
    </aside><div className="min-h-0 max-[899px]:hidden"><ConversationList items={orderedConversations} activeId={activeId} onSelect={selectConversation} isLoading={isConversationListLoading} availableTags={availableTags} onTagsChange={updateConversationTags} collapsed={isConversationListCollapsed} onResizeStart={handleConversationListResizeStart} /></div><div className="flex min-h-0 min-w-0 flex-col"><div className={`flex min-h-0 flex-1 flex-col ${isConversationListOpen ? "max-[899px]:hidden" : ""}`}><ChatWindow {...chatWindowPinProps} conversation={active} messages={messages} isLoadingMessages={isLoadingMessages} onSend={sendText} onRetryMessage={retryMessage} quickReplies={quickReplies} draft={getConversationDraft(drafts, activeId)} onDraftChange={updateActiveDraft} onOpenConversationList={() => setIsConversationListOpen(true)} showOpenNextUnreadAction={hasCurrentGeneralSettings && generalSettings.openNextUnreadConversation && Boolean(getNextUnreadConversationId(orderedConversations, activeId ?? ""))} onOpenNextUnread={openNextUnreadConversation} isCustomerTyping={isCustomerTyping} aiSuggestions={aiSuggestions} isAiSuggestionsLoading={isAiSuggestionsLoading} aiSuggestionsError={aiSuggestionsError} onRefreshAiSuggestions={refreshAiSuggestions} aiSuggestionsEnabled={aiSuggestionsEnabled} availableTags={availableTags} onTagsChange={updateActiveConversationTags} onToggleBot={toggleActiveBot} isTogglingBot={isTakingOver} toggleBotError={takeoverError} /></div></div>{isConversationListOpen && <><button className="fixed inset-0 z-40 bg-slate-900/30 min-[900px]:hidden cursor-pointer" type="button" onClick={() => setIsConversationListOpen(false)} aria-label="Đóng danh sách hội thoại" /><div className="fixed left-[44px] right-0 top-16 bottom-0 z-50 flex min-[900px]:hidden"><ConversationList items={orderedConversations} activeId={activeId} onSelect={selectConversation} isLoading={isConversationListLoading} availableTags={availableTags} onTagsChange={updateConversationTags} /></div></>}</div></div></main>;
}
