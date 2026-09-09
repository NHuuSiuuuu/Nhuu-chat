import * as React from "react";
import { useEffect, useState } from "react";
import { chatEvents, type ChatMessageContract, type ConversationContract } from "@nhuu-chat/contracts";
import { apiRequest } from "../lib/api.js";
import { createChatSocket } from "../lib/socket.js";
import { resolveApiBaseUrl } from "../lib/api-url.js";
import { ConversationList } from "../components/conversations/ConversationList.js";
import { ChatWindow } from "../components/conversations/ChatWindow.js";
import { appendUniqueMessage, mergeMessages, upsertConversation } from "../state/inbox-realtime.js";
import { InboxIcon } from "../components/conversations/InboxIcon.js";
import { DashboardTopbar } from "../components/dashboard/DashboardTopbar.js";

const API_URL = resolveApiBaseUrl(import.meta.env.VITE_API_URL);
export function InboxPage({ token, refresh, onBack }: { token: string; refresh?: () => Promise<string | null>; onBack?: () => void }) {
  const [conversations, setConversations] = useState<ConversationContract[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageContract[]>([]);
  const active = conversations.find((item) => item.id === activeId) ?? null;
  useEffect(() => { void apiRequest<{ conversations: ConversationContract[] }>(API_URL, "/api/v1/conversations", token, {}, refresh).then((result) => { setConversations(result.conversations); setActiveId((current) => current ?? result.conversations[0]?.id ?? null); }); }, [token, refresh]);
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
    socket.on(chatEvents.messageReceived, (message: ChatMessageContract) => { if (message.conversationId === activeId) setMessages((current) => appendUniqueMessage(current, message)); });
    socket.on(chatEvents.conversationUpdated, (conversation: ConversationContract) => {
      setConversations((current) => upsertConversation(current, conversation));
      setActiveId((current) => current ?? conversation.id);
    });
    joinActiveRoom();
    return () => { socket.off("connect", joinActiveRoom); socket.disconnect(); };
  }, [token, activeId]);
  function selectConversation(id: string) { setActiveId(id); }
  async function sendText(content: string) { if (!activeId) return; const message = await apiRequest<ChatMessageContract>(API_URL, "/api/v1/messages/send", token, { method: "POST", body: JSON.stringify({ conversationId: activeId, type: "text", content }) }, refresh); setMessages((current) => appendUniqueMessage(current, message)); }
  return <main className="inbox-shell"><div className="flex h-screen flex-col overflow-hidden bg-slate-100"><DashboardTopbar /><div className="inbox-page grid min-h-0 flex-1 grid-cols-[44px_395px_minmax(0,1fr)] overflow-hidden bg-slate-100 text-gray-800 max-[900px]:grid-cols-[44px_minmax(300px,35vw)_minmax(0,1fr)] max-[680px]:grid-cols-[44px_minmax(0,1fr)]"><aside className="inbox-nav flex flex-col items-center gap-3 bg-blue-600 px-1 py-3" aria-label="Thanh điều hướng"><div className="inbox-nav-logo mb-2 grid size-[30px] place-items-center rounded-lg border border-white/70 text-[17px] font-bold text-white">H</div><button className="inbox-nav-item grid size-9 place-items-center rounded-lg bg-black/15 text-white transition-colors hover:bg-black/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300" type="button" aria-label="Hội thoại"><InboxIcon name="chat" /></button><button className="inbox-nav-item grid size-9 place-items-center rounded-lg text-white/80 transition-colors hover:bg-black/15 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300" type="button" aria-label="Hộp thư"><InboxIcon name="inbox" /></button><button className="inbox-nav-item grid size-9 place-items-center rounded-lg text-white/80 transition-colors hover:bg-black/15 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300" type="button" aria-label="Khách hàng"><InboxIcon name="users" /></button><div className="inbox-nav-spacer flex-1" /><button className="inbox-nav-item grid size-9 place-items-center rounded-lg text-white/80 transition-colors hover:bg-black/15 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300" type="button" aria-label="Trợ giúp"><InboxIcon name="help" /></button><button className="inbox-nav-item grid size-9 place-items-center rounded-lg text-white/80 transition-colors hover:bg-black/15 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300" type="button" aria-label="Cài đặt"><InboxIcon name="settings" /></button>{onBack && <button className="inbox-nav-item grid size-9 place-items-center rounded-lg text-white/80 transition-colors hover:bg-black/15 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300" type="button" aria-label="Về Dashboard" onClick={onBack}>←</button>}</aside><ConversationList items={conversations} activeId={activeId} onSelect={(id) => void selectConversation(id)} /><ChatWindow conversation={active} messages={messages} onSend={sendText} /></div></div></main>;
}
