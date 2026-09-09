import { useEffect, useState } from "react";
import type { ChatMessageContract, ConversationContract } from "@nhuu-chat/contracts";
import { apiRequest } from "../lib/api.js";
import { createChatSocket } from "../lib/socket.js";
import { ConversationList } from "../components/conversations/ConversationList.js";
import { ChatWindow } from "../components/conversations/ChatWindow.js";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";
export function InboxPage({ token }: { token: string }) {
  const [conversations, setConversations] = useState<ConversationContract[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageContract[]>([]);
  const active = conversations.find((item) => item.id === activeId) ?? null;
  useEffect(() => { void apiRequest<{ conversations: ConversationContract[] }>(API_URL, "/api/v1/conversations", token).then((result) => setConversations(result.conversations)); }, [token]);
  useEffect(() => { const socket = createChatSocket(API_URL, token); socket.on("chat:message_received", (message: ChatMessageContract) => { if (message.conversationId === activeId) setMessages((current) => [...current, message]); }); return () => { socket.disconnect(); }; }, [token, activeId]);
  async function selectConversation(id: string) { setActiveId(id); const result = await apiRequest<{ messages: ChatMessageContract[] }>(API_URL, `/api/v1/conversations/${id}/messages`, token); setMessages(result.messages); }
  async function sendText(content: string) { if (!activeId) return; const message = await apiRequest<ChatMessageContract>(API_URL, "/api/v1/messages/send", token, { method: "POST", body: JSON.stringify({ conversationId: activeId, type: "text", content }) }); setMessages((current) => [...current, message]); }
  return <main><h1>Nhuu Chat Inbox</h1><div><ConversationList items={conversations} activeId={activeId} onSelect={(id) => void selectConversation(id)} /><ChatWindow conversation={active} messages={messages} onSend={sendText} /></div></main>;
}
