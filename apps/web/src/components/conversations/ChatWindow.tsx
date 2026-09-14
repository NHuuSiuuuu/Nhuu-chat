import * as React from "react";
import { useEffect, useRef, useState } from "react";
import type { ChatMessageContract, ConversationContract, QuickReplyContract } from "@nhuu-chat/contracts";
import { MessageComposer } from "./MessageComposer.js";
import { InboxIcon } from "./InboxIcon.js";
import { ConversationAvatar } from "./ConversationAvatar.js";
import { ConversationInfoSidebar } from "./ConversationInfoSidebar.js";
import { conversationDisplayName, conversationPlatformLabel, formatConversationTime, isNearLatestMessage } from "../../state/inbox-ui.js";

function messageSenderName(message: ChatMessageContract, conversation: ConversationContract, conversationName: string): string {
  if (message.senderName?.trim()) return message.senderName.trim();
  if (message.senderType === "customer") return conversation.customerName?.trim() || conversationName;
  return message.senderType === "bot" ? "Bot" : "Bạn";
}

function renderMessageContent(content: string): React.ReactNode {
  return content.split(/(@All)/g).map((part, index) => part === "@All" ? <strong className="font-semibold text-blue-600" key={`${part}-${index}`}>{part}</strong> : part);
}

export function ChatWindow({ conversation, messages, onSend, quickReplies, onOpenConversationList, isCustomerTyping = false, aiSuggestions, isAiSuggestionsLoading = false, aiSuggestionsError, onRefreshAiSuggestions, aiSuggestionsEnabled = true }: { conversation: ConversationContract | null; messages: ChatMessageContract[]; onSend: (content: string) => Promise<void>; quickReplies: QuickReplyContract[]; onOpenConversationList?: () => void; isCustomerTyping?: boolean; aiSuggestions?: string[] | null; isAiSuggestionsLoading?: boolean; aiSuggestionsError?: string | null; onRefreshAiSuggestions?: () => void; aiSuggestionsEnabled?: boolean }) {
  const messagesRef = useRef<HTMLDivElement>(null);
  const stickToLatestRef = useRef(true);
  const scrollFrameRef = useRef<number | null>(null);
  const [showLatestButton, setShowLatestButton] = useState(false);
  const [isInfoSidebarOpen, setIsInfoSidebarOpen] = useState(false);

  // Scrolls only while the agent is following the latest message, preserving manual browsing of older messages.
  function scrollToLatest(behavior: ScrollBehavior = "smooth") {
    const element = messagesRef.current;
    if (!element) return;
    stickToLatestRef.current = true;
    setShowLatestButton(false);
    element.scrollTo({ top: element.scrollHeight, behavior });
  }

  function scheduleScrollToLatest(behavior: ScrollBehavior) {
    if (scrollFrameRef.current !== null) cancelAnimationFrame(scrollFrameRef.current);
    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      if (stickToLatestRef.current) scrollToLatest(behavior);
    });
  }

  useEffect(() => {
    stickToLatestRef.current = true;
    setShowLatestButton(false);
    scheduleScrollToLatest("auto");
    return () => { if (scrollFrameRef.current !== null) cancelAnimationFrame(scrollFrameRef.current); };
  }, [conversation?.id]);

  useEffect(() => {
    if (stickToLatestRef.current) scheduleScrollToLatest("auto");
    return () => { if (scrollFrameRef.current !== null) cancelAnimationFrame(scrollFrameRef.current); };
  }, [messages]);

  function handleScroll() {
    const element = messagesRef.current;
    if (!element) return;
    const nearLatest = isNearLatestMessage(element);
    stickToLatestRef.current = nearLatest;
    setShowLatestButton(!nearLatest && element.scrollHeight > element.clientHeight);
  }

  if (!conversation) return <section className="chat-main flex min-w-0 min-h-0 flex-col bg-slate-100" aria-label="Cửa sổ chat"><div className="chat-empty-state grid h-full place-content-center justify-items-center p-6 text-center"><div className="chat-empty-icon grid size-[120px] place-items-center rounded-full bg-white text-blue-600 shadow-sm"><InboxIcon name="chat" size={52} /></div><h1 className="mt-7 text-[29px] font-semibold text-gray-800">Chào mừng bạn đến với Livechat</h1><p className="mt-3.5 text-base text-gray-500">Chọn một hội thoại từ danh sách bên trái để bắt đầu.</p></div></section>;
   const name = conversationDisplayName(conversation);
  return <section className="chat-main flex min-w-0 min-h-0 flex-col bg-slate-100" aria-label="Cửa sổ chat"><header className="chat-header flex min-h-[72px] items-center gap-3 border-b border-gray-200 bg-white px-6 py-3.5"><button className="grid size-8 place-items-center rounded-md text-gray-500 transition hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300 max-[899px]:grid min-[900px]:hidden" type="button" aria-label="Danh sách hội thoại" onClick={onOpenConversationList}><InboxIcon name="list" size={19} /></button><ConversationAvatar name={name} avatarUrl={conversation.customerAvatarUrl} isGroup={conversation.conversationType === "group"} /><div><h2 className="mb-1 text-base font-semibold">{name}</h2><span className="inline-flex items-center rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">{conversationPlatformLabel(conversation.platform)}</span></div><button className="chat-header-action ml-auto hidden place-items-center text-gray-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300 max-[1179px]:grid" type="button" onClick={() => setIsInfoSidebarOpen(true)} aria-label="Thông tin hội thoại"><InboxIcon name="users" /></button></header><div className="flex min-h-0 flex-1"><div className="flex min-w-0 flex-1 flex-col"><div ref={messagesRef} onScroll={handleScroll} className="chat-messages relative min-h-0 flex-1 overflow-y-auto bg-[#f0f2f5] p-6">{messages.length === 0 ? <p className="chat-no-messages text-center text-gray-400">Chưa có tin nhắn</p> : messages.map((message) => { const senderName = messageSenderName(message, conversation, name); return <article className={`group my-4 flex items-start gap-3 ${message.senderType === "customer" ? "justify-start" : "justify-end"}`} key={message.id}><div className={`flex min-w-0 max-w-full items-end gap-2 ${message.senderType === "customer" ? "flex-row" : "flex-row-reverse"}`}>{message.senderType === "customer" && <ConversationAvatar name={senderName} isGroup={conversation.conversationType === "group"} size="size-10" />}<div className={`flex min-w-0 items-end gap-2 ${message.senderType === "customer" ? "flex-row" : "flex-row-reverse"}`}><div className={`max-w-[min(560px,75%)] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ${message.senderType === "customer" ? "bg-white text-gray-900" : "bg-blue-100 text-gray-900"}`}><p className="m-0 whitespace-pre-wrap">{renderMessageContent(message.content)}</p></div><div className="flex shrink-0 flex-col items-end gap-1 text-right opacity-0 transition-opacity duration-200 group-hover:opacity-100"><div className="flex items-center gap-1 text-gray-500"><button className="grid size-7 place-items-center rounded-full hover:bg-gray-200" type="button" aria-label="Bày tỏ cảm xúc"><InboxIcon name="smile" size={15} /></button><button className="grid size-7 place-items-center rounded-full hover:bg-gray-200" type="button" aria-label="Trả lời tin nhắn"><InboxIcon name="reply" size={15} /></button><button className="grid size-7 place-items-center rounded-full hover:bg-gray-200" type="button" aria-label="Thêm tùy chọn"><InboxIcon name="more" size={15} /></button></div><span className="whitespace-nowrap text-xs font-medium text-gray-500">{senderName}</span><time className="text-[11px] text-gray-400">{formatConversationTime(message.createdAt)}</time></div></div></div></article>; })}{isCustomerTyping && <div className="my-4 flex items-start gap-3" aria-label="Người dùng đang nhập"><div className="flex items-center gap-1 rounded-2xl bg-white px-4 py-3 shadow-sm"><span className="size-2 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.3s]" /><span className="size-2 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.15s]" /><span className="size-2 animate-bounce rounded-full bg-gray-400" /></div></div>}{showLatestButton && <button className="sticky bottom-3 left-1/2 z-10 mx-auto -mt-10 flex translate-y-0 items-center gap-1 rounded-full border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-700 shadow-lg transition duration-200 hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300" type="button" onClick={() => scrollToLatest("smooth")} aria-label="Cuộn xuống tin nhắn mới nhất">↓ Tin mới nhất</button>}</div><MessageComposer onSend={onSend} quickReplies={quickReplies} aiSuggestions={aiSuggestions} isAiSuggestionsLoading={isAiSuggestionsLoading} aiSuggestionsError={aiSuggestionsError} onRefreshAiSuggestions={onRefreshAiSuggestions} aiSuggestionsEnabled={aiSuggestionsEnabled} /></div><ConversationInfoSidebar mobileOpen={isInfoSidebarOpen} onClose={() => setIsInfoSidebarOpen(false)} /></div></section>;
}
