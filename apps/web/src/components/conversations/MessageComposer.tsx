import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { InboxIcon } from "./InboxIcon.js";
import type { ConversationTagContract, QuickReplyContract } from "@nhuu-chat/contracts";

const members = ["Nguyễn Văn Hữu", "Đội hỗ trợ"];

// Keep suggestion chips empty during a request so stale results are not presented as current.
export function getDisplayedAiSuggestions(aiSuggestions: string[] | null | undefined, isLoading: boolean): string[] {
  return isLoading || !aiSuggestions?.length ? [] : aiSuggestions;
}

export function isTextOnlyDmPlatform(platform?: string): boolean {
  return platform === "facebook" || platform === "instagram";
}

export function createQuickReplyDraft(reply: QuickReplyContract, allowAttachment = true): { content: string; attachmentUrl: string | null } {
  return { content: reply.message, attachmentUrl: allowAttachment ? reply.attachment?.secureUrl ?? null : null };
}

// Giữ lựa chọn bàn phím trong vùng nhìn thấy mà không chuyển focus khỏi ô soạn tin.
export function scrollActiveComposerOption(menu: HTMLDivElement | null): void {
  menu?.querySelector<HTMLElement>('[role="option"][aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
}

export function ComposerSuggestionMenu({ kind, quickReplies, activeIndex, onQuickReply, onMember }: {
  kind: "quick-reply" | "members";
  quickReplies: QuickReplyContract[];
  activeIndex: number;
  onQuickReply: (reply: QuickReplyContract) => void;
  onMember: (member: string) => void;
}) {
  const menuRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    scrollActiveComposerOption(menuRef.current);
  }, [kind, activeIndex, quickReplies]);

  return <div ref={menuRef} className="absolute bottom-full left-3 right-3 z-20 mb-2 max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-white p-1.5 shadow-xl" role="listbox" aria-label={kind === "quick-reply" ? "Mẫu trả lời nhanh" : "Gợi ý thành viên"}>
    {kind === "quick-reply" ? quickReplies.map((reply, index) => <button className={`block w-full rounded-md px-3 py-2 text-left text-sm transition ${index === activeIndex ? "bg-blue-50 text-blue-700" : "text-gray-700 hover:bg-gray-50"} cursor-pointer`} type="button" role="option" aria-selected={index === activeIndex} key={reply.id} onClick={() => onQuickReply(reply)}><span className="block font-semibold">/{reply.shortcut}</span><span className="block truncate text-xs text-gray-500">{reply.message}</span></button>) : members.map((suggestion, index) => <button className={`block w-full rounded-md px-3 py-2 text-left text-sm transition ${index === activeIndex ? "bg-blue-50 text-blue-700" : "text-gray-700 hover:bg-gray-50"} cursor-pointer`} type="button" role="option" aria-selected={index === activeIndex} key={suggestion} onClick={() => onMember(suggestion)}>{suggestion}</button>)}
    {kind === "quick-reply" && quickReplies.length === 0 && <p className="px-3 py-2 text-sm text-gray-500">Chưa có mẫu trả lời nhanh</p>}
  </div>;
}

export interface ComposerBehaviorState {
  content: string;
  attachmentUrl: string | null;
  suggestionKind: "quick-reply" | "members" | null;
  suggestionIndex: number;
}

export type ComposerSendPayload = string | { content: string; attachment: File };

export function createComposerBehaviorState(content = ""): ComposerBehaviorState {
  return { content, attachmentUrl: null, suggestionKind: null, suggestionIndex: 0 };
}

export function syncComposerContent(state: ComposerBehaviorState, content: string): ComposerBehaviorState {
  const trigger = state.suggestionKind === "quick-reply" ? "/" : state.suggestionKind === "members" ? "@" : null;
  return { ...state, content, suggestionKind: trigger && content.startsWith(trigger) ? state.suggestionKind : null };
}

// Xử lý phím bằng một chuyển đổi trạng thái duy nhất để chọn mẫu không thể vô tình kích hoạt gửi tin.
export function processComposerKey(state: ComposerBehaviorState, event: { key: string; shiftKey: boolean }, quickReplies: QuickReplyContract[], onSubmit: () => void): { state: ComposerBehaviorState; preventDefault: boolean } {
  if (event.key === "Escape") return { state: { ...state, suggestionKind: null }, preventDefault: false };
  const suggestionCount = state.suggestionKind === "quick-reply" ? quickReplies.length : members.length;
  if (state.suggestionKind && (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Tab")) {
    if (suggestionCount === 0) return { state, preventDefault: true };
    const direction = event.key === "ArrowUp" ? -1 : 1;
    return { state: { ...state, suggestionIndex: (state.suggestionIndex + direction + suggestionCount) % suggestionCount }, preventDefault: true };
  }
  if (state.suggestionKind && event.key === "Enter" && !event.shiftKey) {
    if (suggestionCount === 0) return { state, preventDefault: true };
    if (state.suggestionKind === "quick-reply") {
      const reply = quickReplies[state.suggestionIndex] ?? quickReplies[0];
      if (!reply) return { state, preventDefault: true };
      const draft = createQuickReplyDraft(reply);
      return { state: { content: draft.content, attachmentUrl: draft.attachmentUrl, suggestionKind: null, suggestionIndex: state.suggestionIndex }, preventDefault: true };
    }
    const member = members[state.suggestionIndex] ?? members[0];
    return { state: member ? { ...state, content: member, attachmentUrl: null, suggestionKind: null } : state, preventDefault: true };
  }
  if (event.key === "/") return { state: { ...state, suggestionKind: "quick-reply", suggestionIndex: 0 }, preventDefault: false };
  if (event.key === "@") return { state: { ...state, suggestionKind: "members", suggestionIndex: 0 }, preventDefault: false };
  if (event.key === "Enter" && !event.shiftKey) {
    onSubmit();
    return { state, preventDefault: true };
  }
  return { state, preventDefault: false };
}

export function MessageComposer({ onSend, quickReplies, disabled = false, draft, onDraftChange, aiSuggestions, aiSuggestionsEnabled = true, isAiSuggestionsLoading = false, aiSuggestionsError, onRefreshAiSuggestions, availableTags = [], conversationTags = [], onTagsChange, platform }: { onSend: (content: ComposerSendPayload) => Promise<boolean>; quickReplies: QuickReplyContract[]; disabled?: boolean; draft?: string; onDraftChange?: (content: string) => void; aiSuggestions?: string[] | null; aiSuggestionsEnabled?: boolean; isAiSuggestionsLoading?: boolean; aiSuggestionsError?: string | null; onRefreshAiSuggestions?: () => void; availableTags?: ConversationTagContract[]; conversationTags?: ConversationTagContract[]; onTagsChange?: (tags: ConversationTagContract[]) => Promise<void>; platform?: string }) {
  const [content, setContent] = useState(draft ?? "");
  const [selectedAttachmentUrl, setSelectedAttachmentUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFilePreviewUrl, setSelectedFilePreviewUrl] = useState<string | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [isShortcutModalOpen, setIsShortcutModalOpen] = useState(false);
  const [suggestionKind, setSuggestionKind] = useState<"quick-reply" | "members" | null>(null);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const composerRef = useRef<HTMLFormElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textOnly = isTextOnlyDmPlatform(platform);
  const availableQuickReplies = textOnly ? quickReplies.map((reply) => ({ ...reply, attachment: undefined })) : quickReplies;

  useEffect(() => {
    if (draft === undefined || !onDraftChange || draft === content) return;
    setContent(draft);
    setSelectedAttachmentUrl(null);
    setSelectedFile(null);
    setAttachmentError(null);
    setSuggestionKind(null);
  }, [draft, content]);

  useEffect(() => {
    if (!textOnly) return;
    setSelectedAttachmentUrl(null);
    setSelectedFile(null);
    setAttachmentError(null);
  }, [textOnly]);

  useEffect(() => {
    if (!selectedFile?.type.startsWith("image/")) {
      setSelectedFilePreviewUrl(null);
      return;
    }
    const previewUrl = URL.createObjectURL(selectedFile);
    setSelectedFilePreviewUrl(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [selectedFile]);

  useEffect(() => {
    if (!suggestionKind) return;
    const closeWhenClickedOutside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || !composerRef.current?.contains(target)) setSuggestionKind(null);
    };
    document.addEventListener("pointerdown", closeWhenClickedOutside);
    return () => document.removeEventListener("pointerdown", closeWhenClickedOutside);
  }, [suggestionKind]);

  const displayedAiSuggestions = getDisplayedAiSuggestions(aiSuggestions, isAiSuggestionsLoading);
  async function toggleConversationTag(tag: ConversationTagContract) {
    if (!onTagsChange) return;
    const nextTags = conversationTags.some((current) => current.id === tag.id)
      ? conversationTags.filter((current) => current.id !== tag.id)
      : [...conversationTags, tag];
    await onTagsChange(nextTags);
  }

  async function submitMessage() {
    if (disabled || (textOnly && (selectedFile || selectedAttachmentUrl)) || (!content.trim() && !selectedFile)) return;
    const sent = await onSend(selectedFile && !textOnly ? { content: content.trim(), attachment: selectedFile } : content.trim());
    if (!sent) return;
    if (draft === undefined) setContent("");
    setSelectedAttachmentUrl(null);
    setSelectedFile(null);
    setSelectedFilePreviewUrl(null);
    setAttachmentError(null);
    setSuggestionKind(null);
  }

  function selectFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      setAttachmentError("Tệp vượt quá giới hạn 20 MB.");
      return;
    }
    setSelectedFile(file);
    setSelectedAttachmentUrl(null);
    setAttachmentError(null);
  }

  function selectSuggestion(value: string) {
    setContent(value);
    onDraftChange?.(value);
    setSelectedAttachmentUrl(null);
    setSelectedFile(null);
    setSuggestionKind(null);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    const result = processComposerKey({ content, attachmentUrl: selectedAttachmentUrl, suggestionKind, suggestionIndex }, { key: event.key, shiftKey: event.shiftKey }, availableQuickReplies, () => { void submitMessage(); });
    if (result.preventDefault) event.preventDefault();
    setContent(result.state.content);
    onDraftChange?.(result.state.content);
    setSelectedAttachmentUrl(result.state.attachmentUrl);
    setSuggestionKind(result.state.suggestionKind);
    setSuggestionIndex(result.state.suggestionIndex);
    if (event.key === "Escape") setIsShortcutModalOpen(false);
  }

  function handleQuickReply(reply: QuickReplyContract) {
    const draft = createQuickReplyDraft(reply, !textOnly);
    setContent(draft.content);
    onDraftChange?.(draft.content);
    setSelectedAttachmentUrl(draft.attachmentUrl);
    setSelectedFile(null);
    setSuggestionKind(null);
  }

  return <>
    <form ref={composerRef} className="message-composer shrink-0 mx-4 mb-3 mt-2 overflow-visible rounded-xl border border-gray-200 bg-white shadow-sm" onSubmit={(event) => { event.preventDefault(); void submitMessage(); }}>
      {availableTags.length > 0 && <div className="border-b border-gray-100">
        <div className="flex w-full flex-wrap gap-1" role="group" aria-label="Gắn thẻ hội thoại">
          {availableTags.map((tag) => {
            const isAttached = conversationTags.some((attached) => attached.id === tag.id);
            return <button className="min-w-[92px] flex-1 px-2 py-1 text-[10px] font-normal text-white transition hover:brightness-95 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-300 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer" style={{ backgroundColor: tag.color }} type="button" key={tag.id} onClick={() => void toggleConversationTag(tag)} disabled={!onTagsChange} aria-label={`Gắn thẻ ${tag.name}`} aria-pressed={isAttached}>{isAttached && <span className="mr-1 inline-block size-2 rounded-full bg-white align-middle" aria-hidden="true" />}<span>{tag.name}</span></button>;
          })}
        </div>
      </div>}
      {aiSuggestionsEnabled && <div className="flex items-center justify-between px-3 pt-1.5 text-xs text-gray-400">
        <span className="inline-flex items-center gap-1.5 font-medium"><InboxIcon name="sparkles" size={14} /> AI gợi ý</span>
        <button className="rounded p-1.5 transition hover:bg-gray-100 hover:text-blue-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer" type="button" aria-label="Làm mới gợi ý AI" onClick={() => onRefreshAiSuggestions?.()} disabled={isAiSuggestionsLoading}><span className={isAiSuggestionsLoading ? "inline-flex animate-spin" : "inline-flex"}><InboxIcon name="refresh" size={15} /></span></button>
      </div>}
      {aiSuggestionsEnabled && isAiSuggestionsLoading && <p className="px-3 pb-1 text-xs text-gray-400" role="status">Đang tải gợi ý AI...</p>}
      {aiSuggestionsEnabled && aiSuggestionsError && <p className="px-3 pb-1 text-xs text-amber-600" role="status">{aiSuggestionsError}</p>}
      {aiSuggestionsEnabled && displayedAiSuggestions.length > 0 && <div className="flex gap-2 overflow-x-auto scrollbar-none px-3 pb-1.5 pt-1" role="group" aria-label="Gợi ý AI">
        {displayedAiSuggestions.map((suggestion) => <button className="min-w-[190px] max-w-[250px] shrink-0 truncate rounded-full border border-violet-200 bg-violet-50 px-4 py-2 text-left text-xs font-semibold text-violet-700 transition hover:border-violet-300 hover:bg-violet-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300 cursor-pointer" type="button" key={suggestion} onClick={() => selectSuggestion(suggestion)} title={suggestion}>{suggestion}</button>)}
      </div>}
      <div className="relative px-3 py-1.5">
        {suggestionKind && <ComposerSuggestionMenu kind={suggestionKind} quickReplies={availableQuickReplies} activeIndex={suggestionIndex} onQuickReply={handleQuickReply} onMember={selectSuggestion} />}
        <textarea className="min-h-12 w-full resize-none border-0 bg-transparent text-sm leading-5 text-gray-800 outline-none placeholder:text-gray-400 focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-1" aria-label="Tin nhắn" value={content} onChange={(event) => { const next = syncComposerContent({ content, attachmentUrl: selectedAttachmentUrl, suggestionKind, suggestionIndex }, event.target.value); setContent(next.content); onDraftChange?.(next.content); setSuggestionKind(next.suggestionKind); }} onKeyDown={handleKeyDown} placeholder="Nhập tin nhắn... (gõ / để chèn mẫu trả lời nhanh, Shift+Enter để xuống dòng)" disabled={disabled} rows={1} />
      </div>
      {selectedAttachmentUrl && <div className="mx-3 mb-1 flex min-w-0 items-center gap-2 rounded-lg text-gray-900  px-3 py-2 text-xs text-gray-900"><InboxIcon name="image" size={16} /><span className="shrink-0 font-semibold">Ảnh đính kèm:</span><a className="min-w-0 truncate underline cursor-pointer transition-opacity hover:opacity-80" href={selectedAttachmentUrl} target="_blank" rel="noreferrer">{selectedAttachmentUrl}</a><button className="ml-auto shrink-0 rounded p-1 hover:bg-sky-100 cursor-pointer" type="button" aria-label="Xoá ảnh đính kèm" onClick={() => setSelectedAttachmentUrl(null)}><InboxIcon name="close" size={14} /></button></div>}
      {selectedFile && <div className="mx-3 mb-1 flex min-w-0 items-center gap-2 rounded-lg text-gray-900  px-3 py-2 text-xs text-gray-900">{selectedFilePreviewUrl ? <img className="size-10 rounded object-cover" src={selectedFilePreviewUrl} alt="Xem trước ảnh đính kèm" /> : <InboxIcon name="file" size={16} />}<span className="min-w-0 truncate font-semibold">{selectedFile.name}</span><span className="shrink-0 text-sky-500">{Math.ceil(selectedFile.size / 1024)} KB</span><button className="ml-auto shrink-0 rounded p-1 hover:bg-sky-100 cursor-pointer" type="button" aria-label="Xoá tệp đính kèm" onClick={() => setSelectedFile(null)}><InboxIcon name="close" size={14} /></button></div>}
      {attachmentError && <p className="mx-3 mb-1 text-xs text-red-600" role="alert">{attachmentError}</p>}
      <div className="flex items-center justify-between border-t border-gray-100 px-3 py-1.5">
        <button className="grid size-8 place-items-center rounded-full bg-gray-100 text-gray-500 transition hover:bg-gray-200 hover:text-gray-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300 cursor-pointer" type="button" onClick={() => setIsShortcutModalOpen(true)} aria-label="Mở phím tắt" title="Phím tắt & hướng dẫn"><span className="text-sm font-bold">?</span></button>
        <div className="flex items-center gap-1">
          {/* <button className="grid size-8 place-items-center rounded-md text-gray-500 transition hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300" type="button" aria-label="Thêm ghi chú"><InboxIcon name="note" size={17} /></button> */}
          {!textOnly && <><input ref={fileInputRef} className="hidden" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.zip,*/*" aria-label="Chọn tệp đính kèm" onChange={(event) => selectFile(event.target.files?.[0])} />
          <input ref={imageInputRef} className="hidden" type="file" accept="image/jpeg,image/png,image/gif,image/webp" aria-label="Chọn hình ảnh đính kèm" onChange={(event) => selectFile(event.target.files?.[0])} />
          <button className="grid size-8 place-items-center rounded-md text-gray-500 transition hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300 cursor-pointer disabled:cursor-not-allowed" type="button" aria-label="Đính kèm tệp" title="Video và tài liệu" onClick={() => fileInputRef.current?.click()} disabled={disabled}><InboxIcon name="paperclip" size={17} /></button>
          <button className="grid size-8 place-items-center rounded-md text-gray-500 transition hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300 cursor-pointer disabled:cursor-not-allowed" type="button" aria-label="Đính kèm hình ảnh" title="Hình ảnh" onClick={() => imageInputRef.current?.click()} disabled={disabled}><InboxIcon name="image" size={17} /></button></>}
          {platform === "instagram" && <><button className="grid size-8 place-items-center rounded-md text-gray-400 opacity-50 cursor-pointer disabled:cursor-not-allowed" type="button" aria-label="Đính kèm tệp" title="Instagram hiện chỉ hỗ trợ tin nhắn văn bản" disabled><InboxIcon name="paperclip" size={17} /></button><button className="grid size-8 place-items-center rounded-md text-gray-400 opacity-50 cursor-pointer disabled:cursor-not-allowed" type="button" aria-label="Đính kèm hình ảnh" title="Instagram hiện chỉ hỗ trợ tin nhắn văn bản" disabled><InboxIcon name="image" size={17} /></button><span className="sr-only" role="note">Instagram hiện chỉ hỗ trợ tin nhắn văn bản</span></>}
          <button className="grid size-8 place-items-center rounded-md text-gray-500 transition hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300 cursor-pointer" type="button" onClick={() => { setSuggestionKind("quick-reply"); setSuggestionIndex(0); }} aria-label="Mở mẫu trả lời" title="Mẫu trả lời nhanh"><InboxIcon name="template" size={17} /></button>
          <button className="grid size-8 place-items-center rounded-md bg-blue-600 text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300 cursor-pointer" type="submit" aria-label="Gửi tin nhắn" title="Gửi tin nhắn" disabled={disabled}><InboxIcon name="send" size={17} /></button>
        </div>
      </div>
    </form>
    {isShortcutModalOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/30 p-4" role="presentation" onMouseDown={() => setIsShortcutModalOpen(false)}>
      <section className="w-full max-w-md animate-[composer-dialog-in_180ms_ease-out] rounded-xl bg-white p-5 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="composer-shortcuts-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between"><h2 className="text-base font-semibold text-gray-800" id="composer-shortcuts-title">Phím tắt &amp; Mẹo</h2><button className="grid size-8 place-items-center rounded-md text-gray-500 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300 cursor-pointer" type="button" onClick={() => setIsShortcutModalOpen(false)} aria-label="Đóng phím tắt"><InboxIcon name="close" size={17} /></button></div>
        <div className="mt-4 space-y-2 text-sm text-gray-600"><p className="flex items-center justify-between">Gửi tin nhắn <kbd className="rounded bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">Enter</kbd></p><p className="flex items-center justify-between">Xuống dòng <kbd className="rounded bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">Shift + Enter</kbd></p><p className="flex items-center justify-between">Mẫu trả lời nhanh <kbd className="rounded bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">/</kbd></p><p className="flex items-center justify-between">Gợi ý thành viên nhóm <kbd className="rounded bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">@</kbd></p><p className="flex items-center justify-between">Đóng danh sách <kbd className="rounded bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">Esc</kbd></p></div>
      </section>
    </div>}
  </>;
}
