import * as React from "react";
import { useEffect, useRef, useState } from "react";
import type { ChatMessageContract, ConversationContract, ConversationTagContract, QuickReplyContract } from "@nhuu-chat/contracts";
import { MessageComposer, type ComposerSendPayload } from "./MessageComposer.js";
import { InboxIcon } from "./InboxIcon.js";
import { ConversationAvatar } from "./ConversationAvatar.js";
import { ConversationInfoSidebar } from "./ConversationInfoSidebar.js";
import { PlatformIcon } from "../dashboard/PlatformIcon.js";
import { conversationDisplayName, conversationPlatformLabel, formatConversationTime, isNearLatestMessage } from "../../state/inbox-ui.js";

export type MessageDeliveryState = "sending" | "sent" | "failed";

export function getMessageDeliveryState(status: ChatMessageContract["deliveryStatus"]): MessageDeliveryState {
  return status === "failed" ? "failed" : status === "pending" ? "sending" : "sent";
}

function messageSenderName(message: ChatMessageContract, conversation: ConversationContract, conversationName: string): string {
  if (message.senderName?.trim()) return message.senderName.trim();
  if (message.senderType === "customer") return conversation.customerName?.trim() || conversationName;
  return message.senderType === "bot" ? "Bot" : "Bạn";
}

function renderMessageContent(content: string): React.ReactNode {
  return content.split(/(@All)/g).map((part, index) => part === "@All" ? <strong className="font-semibold text-blue-600" key={`${part}-${index}`}>{part}</strong> : part);
}

function MessageDeliveryIndicator({ message, onRetry }: { message: ChatMessageContract; onRetry?: (messageId: string) => void }) {
  if (message.senderType !== "agent") return null;
  const state = getMessageDeliveryState(message.deliveryStatus);
  const position = "absolute bottom-1 -right-5";
  if (state === "failed" && onRetry) return <button className={`${position} grid size-6 place-items-center rounded-full bg-red-600 text-xs font-bold text-white shadow-md transition hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300`} type="button" onClick={() => onRetry(message.id)} aria-label="Gửi lại tin nhắn" title="Gửi lại tin nhắn">!</button>;
  if (state === "sending") return <span className={`${position} grid size-5 place-items-center rounded-full bg-white/90 text-blue-600 shadow-sm`} aria-label="Đang gửi tin nhắn"><span className="animate-spin"><InboxIcon name="refresh" size={13} /></span></span>;
  return <span className={`${position} grid size-5 place-items-center rounded-full bg-white/90 text-emerald-600 shadow-sm`} aria-label="Đã gửi tin nhắn"><span className="text-xs font-bold">✓</span></span>;
}

function renderMessageAttachments(message: ChatMessageContract, onRetry?: (messageId: string) => void): React.ReactNode {
  return message.attachments?.map((attachment) => attachment.mimeType.startsWith("image/")
    ? <div className="relative mb-2 rounded-lg" key={attachment.url}><a className="block overflow-hidden rounded-lg" href={attachment.url} target="_blank" rel="noreferrer" aria-label={`Mở hình ảnh ${attachment.fileName ?? "đính kèm"}`}><img className="max-h-72 max-w-full object-contain" src={attachment.url} alt={attachment.fileName ?? "Hình ảnh đính kèm"} /></a><MessageDeliveryIndicator message={message} onRetry={onRetry} /></div>
    : <div className="relative mb-2" key={attachment.url}><a className="flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sky-700 underline" href={attachment.url} target="_blank" rel="noreferrer" aria-label={`Tải tệp đính kèm ${attachment.fileName ?? ""}`}><InboxIcon name="file" size={17} /><span className="min-w-0 truncate">{attachment.fileName ?? "Tệp đính kèm"}</span></a><MessageDeliveryIndicator message={message} onRetry={onRetry} /></div>);
}

export function ChatWindow({ conversation, messages, onSend, onRetryMessage, quickReplies, onOpenConversationList, isCustomerTyping = false, aiSuggestions, isAiSuggestionsLoading = false, aiSuggestionsError, onRefreshAiSuggestions, aiSuggestionsEnabled = true, availableTags = [], onTagsChange, draft = "", onDraftChange, onToggleBot, isTogglingBot = false, toggleBotError }: { conversation: ConversationContract | null; messages: ChatMessageContract[]; onSend: (content: ComposerSendPayload) => Promise<boolean>; onRetryMessage?: (messageId: string) => void; quickReplies: QuickReplyContract[]; onOpenConversationList?: () => void; isCustomerTyping?: boolean; aiSuggestions?: string[] | null; isAiSuggestionsLoading?: boolean; aiSuggestionsError?: string | null; onRefreshAiSuggestions?: () => void; aiSuggestionsEnabled?: boolean; availableTags?: ConversationTagContract[]; onTagsChange?: (tags: ConversationTagContract[]) => Promise<void>; draft?: string; onDraftChange?: (content: string) => void; onToggleBot?: () => Promise<void>; isTogglingBot?: boolean; toggleBotError?: string | null }) {
  const messagesRef = useRef<HTMLDivElement>(null);
  const stickToLatestRef = useRef(true);
  const scrollFrameRef = useRef<number | null>(null);
  const [showLatestButton, setShowLatestButton] = useState(false);
  const [isInfoSidebarOpen, setIsInfoSidebarOpen] = useState(false);

  // Chỉ tự cuộn khi nhân viên đang theo dõi tin mới nhất, giữ nguyên vị trí khi xem tin cũ.
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

  if (!conversation) return <section className="chat-main flex min-w-0 min-h-0 flex-col bg-slate-100" aria-label="Cửa sổ chat"><div className="flex min-h-0 flex-1"><div className="flex min-w-0 flex-1 flex-col"><div className="chat-empty-state grid h-full place-content-center justify-items-center p-6 text-center"><div className="chat-empty-icon grid size-[120px] place-items-center rounded-full bg-white text-blue-600 shadow-sm"><InboxIcon name="chat" size={52} /></div><p className="mt-3.5 text-base text-gray-500">Chọn một hội thoại từ danh sách bên trái để bắt đầu.</p><button className="mt-5 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300 min-[900px]:hidden" type="button" onClick={onOpenConversationList} aria-label="Mở danh sách hội thoại"><InboxIcon name="list" size={17} />Mở danh sách hội thoại</button></div></div><ConversationInfoSidebar hasConversation={false} /></div></section>;
  const name = conversationDisplayName(conversation);
  const platformIconProvider = conversation.platform === "zalo_personal" ? "zalo" : conversation.platform === "telegram_personal" ? "telegram" : conversation.platform;
  const botEnabled = conversation.botEnabled !== false;
  return <section className="chat-main flex min-w-0 min-h-0 flex-col bg-slate-100" aria-label="Cửa sổ chat"><header className="chat-header flex min-h-[72px] items-center gap-3 border-b border-gray-200 bg-white px-6 py-3.5"><button className="grid size-8 place-items-center rounded-md text-gray-500 transition hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:ring-2 focus-visible:ring-blue-300 max-[899px]:grid min-[900px]:hidden" type="button" aria-label="Quay lại danh sách hội thoại" onClick={onOpenConversationList}><InboxIcon name="chevron-left" size={19} /></button><ConversationAvatar name={name} avatarUrl={conversation.customerAvatarUrl} isGroup={conversation.conversationType === "group"} /><div><h2 className="mb-1 text-base font-semibold">{name}</h2><span className="inline-flex items-center" title={conversationPlatformLabel(conversation.platform)} aria-label={conversationPlatformLabel(conversation.platform)}><PlatformIcon provider={platformIconProvider} size={15} /></span></div>{onToggleBot && <div className="ml-auto flex items-center gap-2">{toggleBotError && <span className="text-xs text-red-600" role="alert">{toggleBotError}</span>}<span className="text-xs font-medium text-gray-500">Bot tự động</span><button className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0 transition-colors ${botEnabled ? "bg-sky-500" : "bg-gray-300"} disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:ring-2 focus-visible:ring-blue-300`} type="button" role="switch" aria-checked={botEnabled} aria-label={botEnabled ? "Tắt bot tự động" : "Bật bot tự động"} onClick={() => void onToggleBot()} disabled={isTogglingBot}><span className={`absolute left-1 top-1 size-4 rounded-full bg-white shadow-sm transition-transform ${botEnabled ? "translate-x-5" : "translate-x-0"}`} /></button></div>}<button className="chat-header-action ml-auto hidden place-items-center text-gray-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:ring-2 focus-visible:ring-blue-300 max-[999px]:grid" type="button" onClick={() => setIsInfoSidebarOpen(true)} aria-label="Thông tin hội thoại"><InboxIcon name="users" /></button></header><div className="flex min-h-0 flex-1"><div className="flex min-w-0 flex-1 flex-col"><div ref={messagesRef} onScroll={handleScroll} className="chat-messages relative min-h-0 flex-1 overflow-y-auto bg-[#f0f2f5] p-6">{messages.length === 0 ? <p className="chat-no-messages text-center text-gray-400">Chưa có tin nhắn</p> : messages.map((message) => { const senderName = messageSenderName(message, conversation, name); const hasAttachments = Boolean(message.attachments?.length); return <article className={`group my-4 flex items-start gap-3 ${message.senderType === "customer" ? "justify-start" : "justify-end"}`} key={message.id}><div className={`flex min-w-0 max-w-full items-end gap-2 ${message.senderType === "customer" ? "flex-row" : "flex-row-reverse"}`}>{message.senderType === "customer" && <ConversationAvatar name={senderName} isGroup={conversation.conversationType === "group"} size="size-10" />}<div className={`flex min-w-0 items-end gap-2 ${message.senderType === "customer" ? "flex-row" : "flex-row-reverse"}`}><div className={`relative max-w-[min(560px,75%)] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ${message.senderType === "customer" ? "bg-white text-gray-900" : "bg-blue-100 text-gray-900"}`}><div className="space-y-2">{renderMessageAttachments(message, onRetryMessage)}{message.content && <p className="m-0 whitespace-pre-wrap">{renderMessageContent(message.content)}</p>}</div>{!hasAttachments && <MessageDeliveryIndicator message={message} onRetry={onRetryMessage} />}</div><div className="flex shrink-0 flex-col items-end gap-1 text-right"><div className="flex items-center gap-1 text-gray-500 opacity-0 transition-opacity duration-200 group-hover:opacity-100"><button className="grid size-7 place-items-center rounded-full hover:bg-gray-200" type="button" aria-label="Bày tỏ cảm xúc"><InboxIcon name="smile" size={15} /></button><button className="grid size-7 place-items-center rounded-full hover:bg-gray-200" type="button" aria-label="Trả lời tin nhắn"><InboxIcon name="reply" size={15} /></button><button className="grid size-7 place-items-center rounded-full hover:bg-gray-200" type="button" aria-label="Thêm tùy chọn"><InboxIcon name="more" size={15} /></button></div><span className="opacity-0 transition-opacity duration-200 group-hover:opacity-100 whitespace-nowrap text-xs font-medium text-gray-500">{senderName}</span><time className="opacity-0 transition-opacity duration-200 group-hover:opacity-100 text-[11px] text-gray-400">{formatConversationTime(message.createdAt)}</time></div></div></div></article>; })}{isCustomerTyping && <div className="my-4 flex items-start gap-3" aria-label="Người dùng đang nhập"><div className="flex items-center gap-1 rounded-2xl bg-white px-4 py-3 shadow-sm"><span className="size-2 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.3s]" /><span className="size-2 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.15s]" /><span className="size-2 animate-bounce rounded-full bg-gray-400" /></div></div>}{showLatestButton && <button className="sticky bottom-3 left-1/2 z-10 mx-auto -mt-10 flex translate-y-0 items-center gap-1 rounded-full border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-700 shadow-lg transition duration-200 hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:ring-2 focus-visible:ring-blue-300" type="button" onClick={() => scrollToLatest("smooth")} aria-label="Cuộn xuống tin nhắn mới nhất">↓ Tin mới nhất</button>}</div><MessageComposer onSend={onSend} quickReplies={quickReplies} draft={draft} onDraftChange={onDraftChange} aiSuggestions={aiSuggestions} isAiSuggestionsLoading={isAiSuggestionsLoading} aiSuggestionsError={aiSuggestionsError} onRefreshAiSuggestions={onRefreshAiSuggestions} aiSuggestionsEnabled={aiSuggestionsEnabled} availableTags={availableTags} conversationTags={conversation.tags ?? []} onTagsChange={onTagsChange} /></div><ConversationInfoSidebar mobileOpen={isInfoSidebarOpen} onClose={() => setIsInfoSidebarOpen(false)} hasConversation={Boolean(conversation)} /></div></section>;
}
