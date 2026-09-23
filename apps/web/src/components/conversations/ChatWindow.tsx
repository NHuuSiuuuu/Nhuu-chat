import * as React from "react";
import { useEffect, useRef, useState } from "react";
import type { ChatMessageContract, ConversationContract, ConversationTagContract, PinnedMessageContract, QuickReplyContract } from "@nhuu-chat/contracts";
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
  const position = "absolute bottom-1 right-0";
  if (state === "failed" && onRetry) return <button className={`${position} grid size-6 place-items-center rounded-full bg-red-600 text-xs font-bold text-white shadow-md transition hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300 cursor-pointer`} type="button" onClick={() => onRetry(message.id)} aria-label="Gửi lại tin nhắn" title="Gửi lại tin nhắn">!</button>;
  if (state === "sending") return <span className={`${position} grid size-5 place-items-center  text-blue-600`} aria-label="Đang gửi tin nhắn"><span className="animate-spin"><InboxIcon name="refresh" size={13} /></span></span>;
  return <span className={`${position} grid size-5 place-items-center text-emerald-600`} aria-label="Đã gửi tin nhắn"><span className="text-xs font-bold">✓</span></span>;
}

function renderMessageAttachments(message: ChatMessageContract): React.ReactNode {
  return message.attachments?.map((attachment) => attachment.mimeType.startsWith("image/")
    ? <div className="relative mb-2 rounded-lg" key={attachment.url}><a className="block overflow-hidden rounded-lg cursor-pointer transition-opacity hover:opacity-80" href={attachment.url} target="_blank" rel="noreferrer" aria-label={`Mở hình ảnh ${attachment.fileName ?? "đính kèm"}`}><img className="max-h-72 max-w-full object-contain" src={attachment.url} alt={attachment.fileName ?? "Hình ảnh đính kèm"} /></a></div>
    : <div className="relative mb-2" key={attachment.url}><a className="flex items-center gap-2 rounded-lg border border-sky-200 text-gray-900  px-3 py-2 text-gray-900underline cursor-pointer transition-opacity hover:opacity-80" href={attachment.url} target="_blank" rel="noreferrer" aria-label={`Tải tệp đính kèm ${attachment.fileName ?? ""}`}><InboxIcon name="file" size={17} /><span className="min-w-0 truncate">{attachment.fileName ?? "Tệp đính kèm"}</span></a></div>);
}

type MessagePinMutation = (messageId: string) => Promise<void>;

interface ChatWindowProps {
  conversation: ConversationContract | null;
  messages: ChatMessageContract[];
  isLoadingMessages?: boolean;
  onSend: (content: ComposerSendPayload) => Promise<boolean>;
  onRetryMessage?: (messageId: string) => void;
  quickReplies: QuickReplyContract[];
  pinnedMessages: PinnedMessageContract[];
  isPinned: (messageId: string) => boolean;
  onPinMessage: MessagePinMutation;
  onUnpinMessage: MessagePinMutation;
  pinError?: string | null;
  onOpenConversationList?: () => void;
  showOpenNextUnreadAction?: boolean;
  onOpenNextUnread?: () => void;
  isCustomerTyping?: boolean;
  aiSuggestions?: string[] | null;
  isAiSuggestionsLoading?: boolean;
  aiSuggestionsError?: string | null;
  onRefreshAiSuggestions?: () => void;
  aiSuggestionsEnabled?: boolean;
  availableTags?: ConversationTagContract[];
  onTagsChange?: (tags: ConversationTagContract[]) => Promise<void>;
  draft?: string;
  onDraftChange?: (content: string) => void;
  onToggleBot?: () => Promise<void>;
  isTogglingBot?: boolean;
  toggleBotError?: string | null;
}

export function getMessageDomId(messageId: string): string {
  return `chat-message-${encodeURIComponent(messageId)}`;
}

// Cuộn theo id đã mã hóa để message id từ nền tảng không thể làm hỏng DOM selector.
export function scrollToPinnedMessage(messageId: string, root: Pick<Document, "getElementById"> = document): void {
  root.getElementById(getMessageDomId(messageId))?.scrollIntoView({ behavior: "smooth", block: "center" });
}

export function handlePinnedBarUnpin(event: Pick<React.MouseEvent<HTMLButtonElement>, "stopPropagation">, messageId: string, onUnpinMessage: MessagePinMutation): void {
  event.stopPropagation();
  void onUnpinMessage(messageId);
}

export function togglePinnedMessagesList(isOpen: boolean): boolean {
  return !isOpen;
}

export async function copyPinnedMessage(content: string, clipboard: Pick<Clipboard, "writeText"> = navigator.clipboard): Promise<void> {
  const value = content.trim();
  if (value) await clipboard.writeText(value);
}

function pinnedMessageQuote(message: PinnedMessageContract): string {
  if (message.content.trim()) return message.content.trim();
  if (message.type === "image") return "Hình ảnh";
  if (message.type === "file") return "Tệp đính kèm";
  return "Tin nhắn đính kèm";
}

function PinnedMessagesBar({ pinnedMessages, activeIndex, onChangeIndex, onUnpinMessage, pinError }: { pinnedMessages: PinnedMessageContract[]; activeIndex: number; onChangeIndex: (index: number) => void; onUnpinMessage: MessagePinMutation; pinError?: string | null }) {
  const [isPinnedListOpen, setIsPinnedListOpen] = useState(false);
  const activePin = pinnedMessages[activeIndex];
  if (!activePin && !pinError) return null;
  return <div className="shrink-0 bg-[#f0f2f5] px-4 pt-3">{activePin && <><section className="group/pinned relative flex min-w-0 items-center gap-3 rounded-xl border border-gray-100 bg-white px-3 py-2.5 shadow-sm" aria-label="Tin nhắn đã ghim"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-gray-100 text-gray-600"><InboxIcon name="pin" size={17} /></span><button className="min-w-0 flex-1 pr-8 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300 cursor-pointer transition-opacity hover:opacity-80" type="button" onClick={() => scrollToPinnedMessage(activePin.messageId)} aria-label={`Cuộn tới tin đã ghim ${activeIndex + 1}`}><span className="block text-xs font-semibold text-gray-800">Tin đã ghim · {pinnedMessages.length}/10</span><span className="mt-0.5 block truncate text-xs text-gray-500">{pinnedMessageQuote(activePin)}</span></button><div className="flex shrink-0 items-center gap-1"><button className="invisible grid size-7 place-items-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 focus-visible:visible group-hover/pinned:visible group-focus-within/pinned:visible cursor-pointer" type="button" onClick={(event) => { event.stopPropagation(); setIsPinnedListOpen((current) => togglePinnedMessagesList(current)); }} aria-expanded={isPinnedListOpen} aria-label={isPinnedListOpen ? "Thu danh sách tin ghim" : "Mở danh sách tin ghim"} title={isPinnedListOpen ? "Thu danh sách tin ghim" : "Mở danh sách tin ghim"}><InboxIcon name={isPinnedListOpen ? "chevron-up" : "chevron-down"} size={16} /></button></div></section>{isPinnedListOpen && <div className="mt-1 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm" role="list" aria-label="Danh sách tin nhắn đã ghim">{pinnedMessages.map((pin, index) => <div className="group/pinned-item flex min-w-0 items-center gap-2 border-b border-gray-100 px-3 py-2 last:border-b-0" key={pin.messageId} role="listitem"><button className="flex min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300 cursor-pointer transition-opacity hover:opacity-80" type="button" onClick={() => { onChangeIndex(index); setIsPinnedListOpen(false); scrollToPinnedMessage(pin.messageId); }} aria-label={`Cuộn tới tin đã ghim ${index + 1}`}>
    {/* <span className="grid size-7 shrink-0 place-items-center rounded-full bg-gray-100 text-gray-500"><InboxIcon name="pin" size={14} /></span> */}
    <span className="min-w-0 truncate text-xs text-gray-600">{pinnedMessageQuote(pin)}</span></button><div className="invisible flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover/pinned-item:visible group-hover/pinned-item:opacity-100 group-focus-within/pinned-item:visible group-focus-within/pinned-item:opacity-100"><button className="grid size-7 place-items-center rounded-full text-gray-400 hover:bg-red-50 hover:text-red-600 cursor-pointer" type="button" onClick={(event) => handlePinnedBarUnpin(event, pin.messageId, onUnpinMessage)} aria-label="Bỏ ghim" title="Bỏ ghim"><InboxIcon name="close" size={14} /></button><button className="grid size-7 place-items-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700 cursor-pointer" type="button" onClick={(event) => { event.stopPropagation(); void copyPinnedMessage(pinnedMessageQuote(pin)); }} aria-label="Sao chép tin đã ghim" title="Sao chép"><InboxIcon name="copy" size={14} /></button></div></div>)}</div>}</>}{pinError && <p className="mt-1 text-xs text-red-600" role="alert">{pinError}</p>}</div>;
}

export function ChatWindow({ conversation, messages, isLoadingMessages = false, onSend, onRetryMessage, quickReplies, pinnedMessages, isPinned, onPinMessage, onUnpinMessage, pinError, onOpenConversationList, showOpenNextUnreadAction = false, onOpenNextUnread, isCustomerTyping = false, aiSuggestions, isAiSuggestionsLoading = false, aiSuggestionsError, onRefreshAiSuggestions, aiSuggestionsEnabled = true, availableTags = [], onTagsChange, draft = "", onDraftChange, onToggleBot, isTogglingBot = false, toggleBotError }: ChatWindowProps) {
  const messagesRef = useRef<HTMLDivElement>(null);
  const stickToLatestRef = useRef(true);
  const scrollFrameRef = useRef<number | null>(null);
  const [showLatestButton, setShowLatestButton] = useState(false);
  const [isInfoSidebarOpen, setIsInfoSidebarOpen] = useState(false);
  const [activePinnedIndex, setActivePinnedIndex] = useState(0);
  const visiblePinnedIndex = pinnedMessages.length === 0 ? 0 : Math.min(activePinnedIndex, pinnedMessages.length - 1);

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

  useEffect(() => setActivePinnedIndex(0), [conversation?.id, pinnedMessages[0]?.messageId]);

  function handleScroll() {
    const element = messagesRef.current;
    if (!element) return;
    const nearLatest = isNearLatestMessage(element);
    stickToLatestRef.current = nearLatest;
    setShowLatestButton(!nearLatest && element.scrollHeight > element.clientHeight);
  }

  if (!conversation) return <section className="chat-main flex h-full min-w-0 min-h-0 flex-col bg-slate-100" aria-label="Cửa sổ chat"><div className="flex min-h-0 flex-1"><div className="flex min-w-0 flex-1 flex-col"><div className="chat-empty-state grid h-full place-content-center justify-items-center p-6 text-center"><div className="chat-empty-icon grid size-[120px] place-items-center rounded-full bg-white text-blue-600 shadow-sm"><InboxIcon name="chat" size={52} /></div><p className="mt-3.5 text-base text-gray-500">Chọn một hội thoại từ danh sách bên trái để bắt đầu.</p><button className="mt-5 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300 min-[900px]:hidden cursor-pointer" type="button" onClick={onOpenConversationList} aria-label="Mở danh sách hội thoại"><InboxIcon name="list" size={17} />Mở danh sách hội thoại</button></div></div><ConversationInfoSidebar hasConversation={false} /></div></section>;
  const name = conversationDisplayName(conversation);
  const platformIconProvider = conversation.platform === "zalo_personal" ? "zalo" : conversation.platform === "telegram_personal" ? "telegram" : conversation.platform;
  const botEnabled = conversation.botEnabled !== false;
  return <section className="chat-main flex h-full min-w-0 min-h-0 flex-col bg-slate-100" aria-label="Cửa sổ chat">
    <header className="chat-header flex min-h-[72px] items-center gap-3 border-b border-gray-200 bg-white px-6 py-3.5 max-[899px]:gap-2 max-[899px]:px-2">
      <button className="grid size-8 place-items-center rounded-md text-gray-500 transition hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:ring-2 focus-visible:ring-blue-300 max-[899px]:grid min-[900px]:hidden cursor-pointer" type="button" aria-label="Quay lại danh sách hội thoại" onClick={onOpenConversationList}><InboxIcon name="chevron-left" size={19} /></button>
      <ConversationAvatar name={name} avatarUrl={conversation.customerAvatarUrl} isGroup={conversation.conversationType === "group"} />
      <div className="flex min-w-0 flex-1 flex-col"><h2 className="mb-1 truncate whitespace-nowrap text-base font-semibold">{name}</h2><span className="inline-flex items-center" title={conversationPlatformLabel(conversation.platform)} aria-label={conversationPlatformLabel(conversation.platform)}><PlatformIcon provider={platformIconProvider} size={15} /></span></div>
      <div className="ml-auto flex shrink-0 items-center gap-2 max-[899px]:gap-1">
        {onToggleBot && <div className="flex items-center gap-2 max-[899px]:gap-1">{toggleBotError && <span className="text-xs text-red-600" role="alert">{toggleBotError}</span>}<span className="text-xs font-medium text-gray-500">Bot tự động</span><button className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0 transition-colors ${botEnabled ? "bg-blue-600" : "bg-gray-300"} disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:ring-2 focus-visible:ring-blue-300 cursor-pointer`} type="button" role="switch" aria-checked={botEnabled} aria-label={botEnabled ? "Tắt bot tự động" : "Bật bot tự động"} onClick={() => void onToggleBot()} disabled={isTogglingBot}><span className={`absolute left-1 top-1 size-4 rounded-full bg-white shadow-sm transition-transform ${botEnabled ? "translate-x-5" : "translate-x-0"}`} /></button></div>}
        {showOpenNextUnreadAction && <button className="rounded-md border border-gray-200 px-2 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300 cursor-pointer" type="button" aria-label="Đánh dấu đã đọc & mở tiếp theo" onClick={onOpenNextUnread}>Đánh dấu đã đọc &amp; mở tiếp theo</button>}
        <button className="chat-header-action hidden place-items-center text-gray-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:ring-2 focus-visible:ring-blue-300 max-[999px]:grid cursor-pointer transition-opacity hover:opacity-80" type="button" onClick={() => setIsInfoSidebarOpen(true)} aria-label="Tùy chọn hội thoại"><InboxIcon name="more" /></button>
      </div>
    </header>
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <PinnedMessagesBar pinnedMessages={pinnedMessages} activeIndex={visiblePinnedIndex} onChangeIndex={setActivePinnedIndex} onUnpinMessage={onUnpinMessage} pinError={pinError} />
        <div ref={messagesRef} onScroll={handleScroll} className="chat-messages relative min-h-0 flex-1 overflow-y-auto bg-transparent p-6">
          {isLoadingMessages ? <div className="grid h-full place-items-center" role="status" aria-label="Đang tải tin nhắn"><img className="size-8 object-contain" src="/message-loading-v2.png" alt="" aria-hidden="true" /></div> : messages.length === 0 ? <p className="chat-no-messages text-center text-gray-400">Chưa có tin nhắn</p> : messages.map((message) => {
            const senderName = messageSenderName(message, conversation, name);
            const messageIsPinned = isPinned(message.id);
            const pinLimitReached = pinnedMessages.length >= 10 && !messageIsPinned;
            return <article id={getMessageDomId(message.id)} data-message-id={message.id} className={`group relative my-4 flex scroll-mt-24 items-start gap-3 ${message.senderType === "customer" ? "justify-start" : "justify-end"} ${message.senderType === "agent" ? "pr-5" : ""}`} key={message.id}>
              <div className={`flex min-w-0 max-w-full items-end gap-2 ${message.senderType === "customer" ? "flex-row" : "flex-row-reverse"}`}>
                {message.senderType === "customer" && <ConversationAvatar name={senderName} avatarUrl={conversation.customerAvatarUrl} isGroup={conversation.conversationType === "group"} size="size-10" />}
                <div className={`flex min-w-0 items-end gap-2 ${message.senderType === "customer" ? "flex-row" : "flex-row-reverse"}`}>
                  <div className={`flex min-w-0 max-w-[min(560px,75%)] flex-col ${message.senderType === "customer" ? "items-start" : "items-end"}`}>
                    <div className={`relative max-w-full rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ${message.senderType === "customer" ? "bg-white text-gray-900" : "bg-blue-100 text-gray-900"}`}><div className="space-y-2">{renderMessageAttachments(message)}{message.content && <p className="m-0 whitespace-pre-wrap">{renderMessageContent(message.content)}</p>}</div></div>
                    {messageIsPinned && <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-gray-500" aria-label="Tin nhắn đã ghim"><InboxIcon name="pin" size={12} />Đã ghim</span>}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                    <div className="flex items-center gap-1 text-gray-500 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100">
                      {messageIsPinned
                        ? <button className="grid size-7 place-items-center rounded-full transition hover:bg-red-50 hover:text-red-600 cursor-pointer" type="button" onClick={() => void onUnpinMessage(message.id)} aria-label="Bỏ ghim" title="Bỏ ghim"><InboxIcon name="pin" size={15} /></button>
                        : <button className="grid size-7 place-items-center rounded-full transition hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer" type="button" onClick={() => void onPinMessage(message.id)} aria-label="Ghim tin nhắn" title={pinLimitReached ? "Đã đạt giới hạn 10 tin ghim" : "Ghim tin nhắn"} disabled={pinLimitReached}><InboxIcon name="pin" size={15} /></button>}
                    </div>
                    <span className="opacity-0 transition-opacity duration-200 group-hover:opacity-100 whitespace-nowrap text-xs font-medium text-gray-500">{senderName}</span>
                    <time className="opacity-0 transition-opacity duration-200 group-hover:opacity-100 text-[11px] text-gray-400">{formatConversationTime(message.createdAt)}</time>
                  </div>
                </div>
              </div>
              <MessageDeliveryIndicator message={message} onRetry={onRetryMessage} />
            </article>;
          })}
          {isCustomerTyping && <div className="my-4 flex items-start gap-3" aria-label="Người dùng đang nhập"><div className="flex items-center gap-1 rounded-2xl bg-white px-4 py-3 shadow-sm"><span className="size-2 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.3s]" /><span className="size-2 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.15s]" /><span className="size-2 animate-bounce rounded-full bg-gray-400" /></div></div>}
          {showLatestButton && <button className="sticky bottom-3 left-1/2 z-10 mx-auto -mt-10 flex translate-y-0 items-center gap-1 rounded-full border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-700 shadow-lg transition duration-200 hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:ring-2 focus-visible:ring-blue-300 cursor-pointer" type="button" onClick={() => scrollToLatest("smooth")} aria-label="Cuộn xuống tin nhắn mới nhất">↓ Tin mới nhất</button>}
        </div>
        <MessageComposer onSend={onSend} quickReplies={quickReplies} draft={draft} onDraftChange={onDraftChange} aiSuggestions={aiSuggestions} isAiSuggestionsLoading={isAiSuggestionsLoading} aiSuggestionsError={aiSuggestionsError} onRefreshAiSuggestions={onRefreshAiSuggestions} aiSuggestionsEnabled={aiSuggestionsEnabled} availableTags={availableTags} conversationTags={conversation.tags ?? []} onTagsChange={onTagsChange} />
      </div>
      <ConversationInfoSidebar mobileOpen={isInfoSidebarOpen} onClose={() => setIsInfoSidebarOpen(false)} hasConversation={Boolean(conversation)} />
    </div>
  </section>;
}
