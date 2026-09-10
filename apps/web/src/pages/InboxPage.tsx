import * as React from "react";
import { useEffect, useState } from "react";
import { chatEvents, type ChatMessageContract, type ConversationContract } from "@nhuu-chat/contracts";
import { apiRequest } from "../lib/api.js";
import { createChatSocket } from "../lib/socket.js";
import { resolveApiBaseUrl } from "../lib/api-url.js";
import { ConversationList } from "../components/conversations/ConversationList.js";
import { ChatWindow } from "../components/conversations/ChatWindow.js";
import { appendUniqueMessage, mergeMessages, upsertConversation } from "../state/inbox-realtime.js";
import { markConversationRead } from "../state/inbox-ui.js";
import { InboxIcon } from "../components/conversations/InboxIcon.js";
import { DashboardTopbar } from "../components/dashboard/DashboardTopbar.js";

const API_URL = resolveApiBaseUrl(import.meta.env.VITE_API_URL);
export function InboxPage({ token, refresh, onBack }: { token: string; refresh?: () => Promise<string | null>; onBack?: () => void }) {
  const [conversations, setConversations] = useState<ConversationContract[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageContract[]>([]);
  const [isConversationListOpen, setIsConversationListOpen] = useState(false);
  const nextReadGenerationRef = React.useRef(0);
  const conversationRevisionRef = React.useRef(new Map<string, number>());
  const conversationsRef = React.useRef<ConversationContract[]>([]);
  const readStateRef = React.useRef(new Map<string, { generation: number; baseline: number; revision: number; confirmedGeneration?: number; confirmedRevision?: number }>());
  const active = conversations.find((item) => item.id === activeId) ?? null;
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
    const socket = createChatSocket(API_URL, token);
    const joinActiveRoom = () => { if (activeId) socket.emit(chatEvents.joinRoom, activeId); };
    socket.on("connect", joinActiveRoom);
    socket.on(chatEvents.messageReceived, (message: ChatMessageContract) => { const revision = (conversationRevisionRef.current.get(message.conversationId) ?? 0) + 1; conversationRevisionRef.current.set(message.conversationId, revision); if (message.conversationId === activeId) { setMessages((current) => appendUniqueMessage(current, message)); void markActiveRead(activeId); } });
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
  }, [token, activeId]);
  function selectConversation(id: string) { setActiveId(id); setReadRequestKey((current) => current + 1); setIsConversationListOpen(false); }
  async function sendText(content: string) { if (!activeId) return; const message = await apiRequest<ChatMessageContract>(API_URL, "/api/v1/messages/send", token, { method: "POST", body: JSON.stringify({ conversationId: activeId, type: "text", content }) }, refresh); setMessages((current) => appendUniqueMessage(current, message)); }
  return <main className="inbox-shell"><div className="flex h-screen min-h-0 flex-col overflow-hidden bg-slate-100"><DashboardTopbar /><div className="inbox-page grid min-h-0 flex-1 grid-cols-[44px_395px_minmax(0,1fr)] overflow-hidden bg-slate-100 text-gray-800 max-[900px]:grid-cols-[44px_minmax(0,1fr)]"><aside className="inbox-nav flex flex-col items-center gap-3 bg-blue-600 px-1 py-3" aria-label="Thanh điều hướng"><div className="inbox-nav-logo mb-2 grid size-[30px] place-items-center rounded-lg border border-white/70 text-[17px] font-bold text-white">H</div><button className="inbox-nav-item grid size-9 place-items-center rounded-lg bg-black/15 text-white transition-colors hover:bg-black/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300" type="button" aria-label="Hội thoại"><InboxIcon name="chat" /></button><button className="inbox-nav-item grid size-9 place-items-center rounded-lg text-white/80 transition-colors hover:bg-black/15 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300" type="button" aria-label="Hộp thư"><InboxIcon name="inbox" /></button><button className="inbox-nav-item grid size-9 place-items-center rounded-lg text-white/80 transition-colors hover:bg-black/15 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300" type="button" aria-label="Khách hàng"><InboxIcon name="users" /></button><div className="inbox-nav-spacer flex-1" /><button className="inbox-nav-item grid size-9 place-items-center rounded-lg text-white/80 transition-colors hover:bg-black/15 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300" type="button" aria-label="Trợ giúp"><InboxIcon name="help" /></button><button className="inbox-nav-item grid size-9 place-items-center rounded-lg text-white/80 transition-colors hover:bg-black/15 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300" type="button" aria-label="Cài đặt"><InboxIcon name="settings" /></button>{onBack && <button className="inbox-nav-item grid size-9 place-items-center rounded-lg text-white/80 transition-colors hover:bg-black/15 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300" type="button" aria-label="Về Dashboard" onClick={onBack}>←</button>}</aside><div className="min-h-0 max-[899px]:hidden"><ConversationList items={conversations} activeId={activeId} onSelect={selectConversation} /></div><ChatWindow conversation={active} messages={messages} onSend={sendText} onOpenConversationList={() => setIsConversationListOpen(true)} />{isConversationListOpen && <><button className="fixed inset-0 z-40 bg-slate-900/30 min-[900px]:hidden" type="button" onClick={() => setIsConversationListOpen(false)} aria-label="Đóng danh sách hội thoại" /><div className="fixed inset-y-0 left-[44px] z-50 flex w-[min(395px,calc(100vw-44px))] min-[900px]:hidden"><ConversationList items={conversations} activeId={activeId} onSelect={selectConversation} /></div></>}</div></div></main>;
}
