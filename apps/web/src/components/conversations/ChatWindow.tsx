import * as React from "react";
import { useEffect, useRef, useState } from "react";
import type { ChatMessageContract, ConversationContract } from "@nhuu-chat/contracts";
import { MessageComposer } from "./MessageComposer.js";
import { InboxIcon } from "./InboxIcon.js";
import { ConversationAvatar } from "./ConversationAvatar.js";
import { conversationDisplayName, conversationPlatformLabel, formatConversationTime, isNearLatestMessage } from "../../state/inbox-ui.js";

export function ChatWindow({ conversation, messages, onSend }: { conversation: ConversationContract | null; messages: ChatMessageContract[]; onSend: (content: string) => Promise<void> }) {
  const messagesRef = useRef<HTMLDivElement>(null);
  const stickToLatestRef = useRef(true);
  const [showLatestButton, setShowLatestButton] = useState(false);

  function scrollToLatest(behavior: ScrollBehavior = "smooth") {
    const element = messagesRef.current;
    if (!element) return;
    stickToLatestRef.current = true;
    setShowLatestButton(false);
    element.scrollTo({ top: element.scrollHeight, behavior });
  }

  useEffect(() => {
    stickToLatestRef.current = true;
    setShowLatestButton(false);
    requestAnimationFrame(() => scrollToLatest("auto"));
  }, [conversation?.id]);

  useEffect(() => {
    if (stickToLatestRef.current) requestAnimationFrame(() => scrollToLatest("auto"));
  }, [messages]);

  function handleScroll() {
    const element = messagesRef.current;
    if (!element) return;
    const nearLatest = isNearLatestMessage(element);
    stickToLatestRef.current = nearLatest;
    setShowLatestButton(!nearLatest && element.scrollHeight > element.clientHeight);
  }

  if (!conversation) return <section className="chat-main flex min-w-0 min-h-0 flex-col bg-slate-100 max-[680px]:hidden" aria-label="Cửa sổ chat"><div className="chat-empty-state grid h-full place-content-center justify-items-center p-6 text-center"><div className="chat-empty-icon grid size-[120px] place-items-center rounded-full bg-white text-blue-600 shadow-sm"><InboxIcon name="chat" size={52} /></div><h1 className="mt-7 text-[29px] font-semibold text-gray-800">Chào mừng bạn đến với Livechat</h1><p className="mt-3.5 text-base text-gray-500">Chọn một hội thoại từ danh sách bên trái để bắt đầu.</p></div></section>;
  const name = conversationDisplayName(conversation);
  return <section className="chat-main flex min-w-0 min-h-0 flex-col bg-slate-100 max-[680px]:hidden" aria-label="Cửa sổ chat"><header className="chat-header flex min-h-[72px] items-center gap-3 border-b border-gray-200 bg-white px-6 py-3.5"><ConversationAvatar name={name} avatarUrl={conversation.customerAvatarUrl} isGroup={conversation.conversationType === "group"} /><div><h2 className="mb-1 text-base font-semibold">{name}</h2><span className="inline-flex items-center rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">{conversationPlatformLabel(conversation.platform)}</span></div><button className="chat-header-action ml-auto grid place-items-center text-gray-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300" type="button" aria-label="Thông tin hội thoại"><InboxIcon name="users" /></button></header><div ref={messagesRef} onScroll={handleScroll} className="chat-messages relative min-h-0 flex-1 overflow-y-auto p-6">{messages.length === 0 ? <p className="chat-no-messages text-center text-gray-400">Chưa có tin nhắn</p> : messages.map((message) => <article className={`chat-message my-2 flex ${message.senderType === "customer" ? "justify-start" : "justify-end"}`} key={message.id}><div className={`chat-message-bubble max-w-[min(560px,75%)] rounded-lg px-3 py-2.5 ${message.senderType === "customer" ? "bg-white" : "bg-blue-100"}`}><p className="m-0 text-sm leading-[1.45]">{message.content}</p><time className="mt-1 block text-[11px] text-gray-400">{formatConversationTime(message.createdAt)}</time></div></article>)}{showLatestButton && <button className="sticky bottom-3 left-1/2 z-10 mx-auto -mt-10 flex translate-y-0 items-center gap-1 rounded-full border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-700 shadow-lg transition duration-200 hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300" type="button" onClick={() => scrollToLatest("smooth")} aria-label="Cuộn xuống tin nhắn mới nhất">↓ Tin mới nhất</button>}</div><MessageComposer onSend={onSend} /></section>;
}
