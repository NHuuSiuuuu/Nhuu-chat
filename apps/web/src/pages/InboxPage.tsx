import * as React from "react";
import { useEffect, useState } from "react";
import { chatEvents, type ChatMessageContract, type ConversationContract } from "@nhuu-chat/contracts";
import { apiRequest } from "../lib/api.js";
import { createChatSocket } from "../lib/socket.js";
import { resolveApiBaseUrl } from "../lib/api-url.js";
import { ConversationList } from "../components/conversations/ConversationList.js";
import { ChatWindow } from "../components/conversations/ChatWindow.js";
import { appendUniqueMessage, mergeMessages, upsertConversation } from "../state/inbox-realtime.js";

const API_URL = resolveApiBaseUrl(import.meta.env.VITE_API_URL);
export function InboxPage({ token, refresh }: { token: string; refresh?: () => Promise<string | null> }) {
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
  return <main><h1>Nhuu Chat Inbox</h1><div><ConversationList items={conversations} activeId={activeId} onSelect={(id) => void selectConversation(id)} /><ChatWindow conversation={active} messages={messages} onSend={sendText} /></div></main>;
}
