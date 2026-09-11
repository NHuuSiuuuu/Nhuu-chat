import * as React from "react";
import { useState } from "react";
import { InboxIcon } from "./InboxIcon.js";

const quickReplies = [
  "Xin chào, em có thể hỗ trợ gì cho anh/chị?",
  "Em đã tiếp nhận yêu cầu và sẽ phản hồi sớm nhất ạ."
];

const members = ["Nguyễn Văn Hữu", "Đội hỗ trợ"];

// Keep suggestion chips empty during a request so stale results are not presented as current.
export function getDisplayedAiSuggestions(aiSuggestions: string[] | null | undefined, isLoading: boolean): string[] {
  return isLoading || !aiSuggestions?.length ? [] : aiSuggestions;
}

export function MessageComposer({ onSend, disabled = false, aiSuggestions, aiSuggestionsEnabled = true, isAiSuggestionsLoading = false, aiSuggestionsError, onRefreshAiSuggestions }: { onSend: (content: string) => Promise<void>; disabled?: boolean; aiSuggestions?: string[] | null; aiSuggestionsEnabled?: boolean; isAiSuggestionsLoading?: boolean; aiSuggestionsError?: string | null; onRefreshAiSuggestions?: () => void }) {
  const [content, setContent] = useState("");
  const [isShortcutModalOpen, setIsShortcutModalOpen] = useState(false);
  const [suggestionKind, setSuggestionKind] = useState<"quick-reply" | "members" | null>(null);
  const [suggestionIndex, setSuggestionIndex] = useState(0);

  const suggestions = suggestionKind === "quick-reply" ? quickReplies : members;
  const displayedAiSuggestions = getDisplayedAiSuggestions(aiSuggestions, isAiSuggestionsLoading);

  async function submitMessage() {
    if (disabled || !content.trim()) return;
    await onSend(content.trim());
    setContent("");
    setSuggestionKind(null);
  }

  function selectSuggestion(value: string) {
    setContent(value);
    setSuggestionKind(null);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Escape") {
      setSuggestionKind(null);
      setIsShortcutModalOpen(false);
      return;
    }
    if (suggestionKind && (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Tab")) {
      event.preventDefault();
      const direction = event.key === "ArrowUp" ? -1 : 1;
      setSuggestionIndex((current) => (current + direction + suggestions.length) % suggestions.length);
      return;
    }
    if (suggestionKind && event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      selectSuggestion(suggestions[suggestionIndex] ?? suggestions[0]);
      return;
    }
    if (event.key === "/") {
      setSuggestionKind("quick-reply");
      setSuggestionIndex(0);
      return;
    }
    if (event.key === "@") {
      setSuggestionKind("members");
      setSuggestionIndex(0);
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submitMessage();
    }
  }

  return <>
    <form className="message-composer mx-4 mb-3 mt-2 overflow-visible rounded-xl border border-gray-200 bg-white shadow-sm" onSubmit={(event) => { event.preventDefault(); void submitMessage(); }}>
      <div className="flex items-center border-b border-gray-100 px-3 py-1.5">
        <button className="inline-flex items-center gap-1.5 rounded-md bg-gray-100 px-2.5 py-1.5 text-xs font-semibold text-gray-600 transition hover:bg-gray-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300" type="button" onClick={() => window.location.assign("/settings/conversation-tags")} aria-label="Quản lý thẻ hội thoại"><InboxIcon name="plus" size={14} /> Thẻ</button>
      </div>
      {aiSuggestionsEnabled && <div className="flex items-center justify-between px-3 pt-1.5 text-xs text-gray-400">
        <span className="inline-flex items-center gap-1.5 font-medium"><InboxIcon name="sparkles" size={14} /> AI gợi ý</span>
        <button className="rounded p-1.5 transition hover:bg-gray-100 hover:text-blue-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300 disabled:cursor-not-allowed disabled:opacity-50" type="button" aria-label="Làm mới gợi ý AI" onClick={() => onRefreshAiSuggestions?.()} disabled={isAiSuggestionsLoading}><span className={isAiSuggestionsLoading ? "inline-flex animate-spin" : "inline-flex"}><InboxIcon name="refresh" size={15} /></span></button>
      </div>}
      {aiSuggestionsEnabled && isAiSuggestionsLoading && <p className="px-3 pb-1 text-xs text-gray-400" role="status">Đang tải gợi ý AI...</p>}
      {aiSuggestionsEnabled && aiSuggestionsError && <p className="px-3 pb-1 text-xs text-amber-600" role="status">{aiSuggestionsError}</p>}
      {aiSuggestionsEnabled && displayedAiSuggestions.length > 0 && <div className="flex gap-2 overflow-x-auto scrollbar-none px-3 pb-1.5 pt-1" role="group" aria-label="Gợi ý AI">
        {displayedAiSuggestions.map((suggestion) => <button className="min-w-[190px] max-w-[250px] shrink-0 truncate rounded-full border border-violet-200 bg-violet-50 px-4 py-2 text-left text-xs font-semibold text-violet-700 transition hover:border-violet-300 hover:bg-violet-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300" type="button" key={suggestion} onClick={() => selectSuggestion(suggestion)} title={suggestion}>{suggestion}</button>)}
      </div>}
      <div className="relative px-3 py-1.5">
        {suggestionKind && <div className="absolute bottom-full left-3 right-3 z-20 mb-2 rounded-lg border border-gray-200 bg-white p-1.5 shadow-xl" role="listbox" aria-label={suggestionKind === "quick-reply" ? "Mẫu trả lời nhanh" : "Gợi ý thành viên"}>
          {suggestions.map((suggestion, index) => <button className={`block w-full rounded-md px-3 py-2 text-left text-sm transition ${index === suggestionIndex ? "bg-blue-50 text-blue-700" : "text-gray-700 hover:bg-gray-50"}`} type="button" role="option" aria-selected={index === suggestionIndex} key={suggestion} onClick={() => selectSuggestion(suggestion)}>{suggestion}</button>)}
        </div>}
        <textarea className="min-h-12 w-full resize-none border-0 bg-transparent text-sm leading-5 text-gray-800 outline-none placeholder:text-gray-400 focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-1" aria-label="Tin nhắn" value={content} onChange={(event) => setContent(event.target.value)} onKeyDown={handleKeyDown} placeholder="Nhập tin nhắn... (gõ / để chèn mẫu trả lời nhanh, Shift+Enter để xuống dòng)" disabled={disabled} rows={1} />
      </div>
      <div className="flex items-center justify-between border-t border-gray-100 px-3 py-1.5">
        <button className="grid size-8 place-items-center rounded-full bg-gray-100 text-gray-500 transition hover:bg-gray-200 hover:text-gray-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300" type="button" onClick={() => setIsShortcutModalOpen(true)} aria-label="Mở phím tắt"><span className="text-sm font-bold">?</span></button>
        <div className="flex items-center gap-1">
          <button className="grid size-8 place-items-center rounded-md text-gray-500 transition hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300" type="button" aria-label="Thêm ghi chú"><InboxIcon name="note" size={17} /></button>
          <button className="grid size-8 place-items-center rounded-md text-gray-500 transition hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300" type="button" aria-label="Đính kèm tệp"><InboxIcon name="paperclip" size={17} /></button>
          <button className="grid size-8 place-items-center rounded-md text-gray-500 transition hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300" type="button" aria-label="Đính kèm hình ảnh"><InboxIcon name="image" size={17} /></button>
          <button className="grid size-8 place-items-center rounded-md text-gray-500 transition hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300" type="button" onClick={() => { setSuggestionKind("quick-reply"); setSuggestionIndex(0); }} aria-label="Mở mẫu trả lời"><InboxIcon name="template" size={17} /></button>
          <button className="grid size-8 place-items-center rounded-md bg-blue-600 text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300" type="submit" aria-label="Gửi tin nhắn" disabled={disabled}><InboxIcon name="send" size={17} /></button>
        </div>
      </div>
    </form>
    {isShortcutModalOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/30 p-4" role="presentation" onMouseDown={() => setIsShortcutModalOpen(false)}>
      <section className="w-full max-w-md animate-[composer-dialog-in_180ms_ease-out] rounded-xl bg-white p-5 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="composer-shortcuts-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between"><h2 className="text-base font-semibold text-gray-800" id="composer-shortcuts-title">Phím tắt &amp; Mẹo</h2><button className="grid size-8 place-items-center rounded-md text-gray-500 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300" type="button" onClick={() => setIsShortcutModalOpen(false)} aria-label="Đóng phím tắt"><InboxIcon name="close" size={17} /></button></div>
        <div className="mt-4 space-y-2 text-sm text-gray-600"><p className="flex items-center justify-between">Gửi tin nhắn <kbd className="rounded bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">Enter</kbd></p><p className="flex items-center justify-between">Xuống dòng <kbd className="rounded bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">Shift + Enter</kbd></p><p className="flex items-center justify-between">Mẫu trả lời nhanh <kbd className="rounded bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">/</kbd></p><p className="flex items-center justify-between">Gợi ý thành viên nhóm <kbd className="rounded bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">@</kbd></p><p className="flex items-center justify-between">Đóng danh sách <kbd className="rounded bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">Esc</kbd></p></div>
      </section>
    </div>}
  </>;
}
