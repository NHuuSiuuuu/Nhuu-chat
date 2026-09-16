import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ConversationContract } from "@nhuu-chat/contracts";
import { conversationAccountName, conversationDisplayName, formatConversationTime, conversationPlatformLabel } from "../../state/inbox-ui.js";
import { InboxIcon } from "./InboxIcon.js";
import { ConversationAvatar } from "./ConversationAvatar.js";
import { PlatformIcon } from "../dashboard/PlatformIcon.js";

interface ConversationListProps {
  items: ConversationContract[];
  activeId: string | null;
  onSelect: (id: string) => void;
  isLoading?: boolean;
  [key: string]: unknown;
  collapsed?: boolean;
  onResizeStart?: (event: React.PointerEvent<HTMLDivElement>) => void;
}
function platformIconProvider(platform: ConversationContract["platform"]) {
  return platform === "telegram_personal" ? "telegram" : platform === "zalo_personal" ? "zalo" : platform;
}

export function getVisibleConversationTagCount(width: number, tagsOrCount: number | Array<{ name: string }>): number {
  const tagWidths = typeof tagsOrCount === "number"
    ? Array.from({ length: tagsOrCount }, () => 72)
    : tagsOrCount.map((tag) => Math.max(56, Math.min(140, tag.name.length * 6.5 + 16)));
  if (tagWidths.length === 0) return 0;
  const reservedWidth = 170;
  const availableWidth = Math.max(0, width - reservedWidth);
  let usedWidth = 0;
  let visibleCount = 0;
  for (const tagWidth of tagWidths) {
    const requiredWidth = visibleCount === 0 ? tagWidth : tagWidth + 6;
    if (visibleCount > 0 && usedWidth + requiredWidth > availableWidth) break;
    usedWidth += requiredWidth;
    visibleCount += 1;
  }
  return Math.max(1, visibleCount);
}

export function ConversationList({ items, activeId, onSelect, isLoading = false, collapsed = false, onResizeStart }: ConversationListProps) {
  const [search, setSearch] = useState("");
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const sidebarRef = useRef<HTMLElement>(null);
  const filtered = useMemo(
    () => items.filter((item) => `${item.channelId} ${item.lastMessageSnippet} ${item.customerName ?? ""} ${item.conversationName ?? ""} ${conversationPlatformLabel(item.platform)}`.toLowerCase().includes(search.toLowerCase())),
    [items, search]
  );

  useEffect(() => {
    const sidebar = sidebarRef.current;
    if (!sidebar) return;
    const updateSidebarWidth = () => setSidebarWidth(sidebar.getBoundingClientRect().width);
    updateSidebarWidth();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(updateSidebarWidth);
    observer.observe(sidebar);
    return () => observer.disconnect();
  }, [collapsed]);

  return <aside ref={sidebarRef} className={`relative rounded-tl-lg conversation-sidebar flex h-full min-w-0 flex-col overflow-hidden border-r border-gray-200 bg-white transition-[width] duration-200 ${collapsed ? "w-[72px]" : "w-full"}`} aria-label="Danh sách hội thoại" aria-busy={isLoading}>
    <div className={`${collapsed ? "flex min-h-[66px] items-center justify-center p-3" : "conversation-toolbar grid grid-cols-[minmax(0,1fr)_82px_40px] gap-2 p-3 max-[680px]:grid-cols-[minmax(0,1fr)_40px]"}`}>
      {collapsed ? <span className="text-gray-400" title="Kéo để thay đổi kích thước danh sách hội thoại"><InboxIcon name="list" /></span> : <><label className="conversation-search flex h-10 min-w-0 items-center gap-2 rounded-lg border border-gray-200 px-2.5 text-gray-400 transition-shadow focus-within:border-blue-300 focus-within:ring-4 focus-within:ring-blue-600/10"><InboxIcon name="search" size={17} /><input className="w-full min-w-0 border-0 bg-transparent text-sm text-gray-800 outline-none placeholder:text-gray-400" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm tên, sđt..." aria-label="Tìm hội thoại" /></label><button className="conversation-filter flex h-10 items-center justify-around rounded-lg border border-gray-200 bg-white text-[13px] text-gray-600 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300 max-[680px]:hidden" type="button"><span>Tất cả</span><span aria-hidden="true">⌄</span></button><button className="conversation-add grid h-10 place-items-center rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300" type="button" aria-label="Thêm hội thoại"><InboxIcon name="plus" /></button></>}
    </div>
    {!collapsed && <div className="conversation-list-header flex min-h-11 items-center justify-between border-y border-gray-200 px-3 text-sm font-semibold text-gray-600"><span>Tất cả hội thoại <b className="ml-1 rounded-full bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-500">{items.length}</b></span><button className="grid place-items-center text-gray-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300" type="button" aria-label="Tùy chọn danh sách"><InboxIcon name="list" /></button></div>}
    <div className={`conversation-items min-h-0 flex-1 overflow-y-auto scrollbar-none ${collapsed ? "py-2" : ""}`}>
      {isLoading ? <div aria-label="Đang tải danh sách hội thoại">{[1, 2, 3, 4, 5].map((row) => <div className={`flex min-h-[88px] items-start gap-3 border-b border-gray-100 px-3 py-3.5 ${collapsed ? "justify-center px-2" : ""}`} key={row}><span className={`size-[48px] shrink-0 rounded-full bg-gray-200 ${collapsed ? "size-[42px]" : ""} animate-pulse`} /><span className={`min-w-0 flex-1 space-y-2 pt-1 ${collapsed ? "hidden" : ""}`}><span className="block h-3 w-3/4 animate-pulse rounded bg-gray-200" /><span className="block h-3 w-full animate-pulse rounded bg-gray-100" /><span className="block h-3 w-1/2 animate-pulse rounded bg-gray-100" /></span></div>)}</div> : filtered.length === 0 ? <div className="conversation-list-empty px-4 py-10 text-center text-[13px] text-gray-400">{collapsed ? "" : "Chưa có hội thoại"}</div> : filtered.map((item) => {
        const name = conversationDisplayName(item);
        const accountName = conversationAccountName({ accountName: item.accountName, platform: item.platform });
        const platform = platformIconProvider(item.platform);
        const tags = item.tags ?? [];
        const visibleTags = tags.slice(0, getVisibleConversationTagCount(sidebarWidth, tags));
        const hiddenTags = tags.slice(visibleTags.length);
        const hiddenCount = hiddenTags.length;
        return <div className={`conversation-item relative flex min-h-[88px] w-full border-b border-gray-100 text-gray-800 transition-colors hover:bg-slate-50 ${item.id === activeId ? "bg-blue-50" : "bg-white"}`} key={item.id}>
          <button className={`flex min-w-0 flex-1 items-start gap-3 border-0 bg-transparent text-left focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300 ${collapsed ? "justify-center px-2 py-3" : "px-3 py-3.5"}`} type="button" onClick={() => onSelect(item.id)} aria-current={item.id === activeId} title={collapsed ? name : undefined}>
            <span className="relative shrink-0">
              <ConversationAvatar name={name} avatarUrl={item.customerAvatarUrl} isGroup={item.conversationType === "group"} size={collapsed ? "size-[42px]" : "size-[48px]"} />
              {item.unreadCount > 0 && <span className="conversation-unread absolute -bottom-1 -right-1 grid size-5 place-items-center rounded-full border-2 border-white bg-red-500 text-[11px] font-bold text-white" aria-label={`${item.unreadCount > 99 ? "99+" : item.unreadCount} thông báo chưa đọc`}>{item.unreadCount > 99 ? "99+" : item.unreadCount}</span>}
            </span>
            <span className={`conversation-item-content grid min-w-0 flex-1 gap-1 ${collapsed ? "hidden" : ""}`}>
              <span className="conversation-item-top flex min-w-0 items-center justify-between gap-2">
                <strong className="min-w-0 truncate text-sm font-semibold text-gray-900">{name}</strong>
                <time className="shrink-0 text-[11px] text-gray-400">{formatConversationTime(item.lastMessageAt)}</time>
              </span>
              <span className="flex min-w-0 items-center gap-2">
                <span className="conversation-preview min-w-0 flex-1 truncate text-xs text-gray-500">{item.lastMessageSnippet || "Hội thoại mới"}</span>
              </span>
              <span className="conversation-account flex min-w-0 items-center gap-1.5 leading-4 text-[11px] text-gray-400"><span className="flex min-w-0 shrink-0 items-center gap-1.5"><ConversationAvatar name={accountName} avatarUrl={item.accountAvatarUrl} size="size-4" /><span className="min-w-0 max-w-[120px] truncate leading-4">{accountName}</span></span>{tags.length > 0 ? <span className="relative flex min-w-0 flex-1 items-center gap-1.5"><span className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden whitespace-nowrap">{visibleTags.map((tag) => <span className="conversation-tag shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold text-white" style={{ backgroundColor: tag.color }} key={tag.id}>{tag.name}</span>)}</span>{hiddenCount > 0 && <span className="group relative shrink-0"><span className="inline-flex rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-blue-500 shadow-sm ring-1 ring-blue-100" title={`Xem ${hiddenCount} thẻ ẩn`}>+{hiddenCount}</span><span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden -translate-x-1/2 gap-1 whitespace-nowrap rounded-lg bg-white p-2 shadow-lg ring-1 ring-gray-200 group-hover:flex group-focus-within:flex" role="tooltip">{hiddenTags.map((tag) => <span className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white" style={{ backgroundColor: tag.color }} key={tag.id}>{tag.name}</span>)}</span></span>}</span> : null}<span className="ml-auto shrink-0" title={conversationPlatformLabel(item.platform)}><PlatformIcon provider={platform} size={15} plain /></span></span>
            </span>
          </button>
        </div>;
      })}
    </div>
    <div className="absolute inset-y-0 right-0 z-10 w-2 cursor-col-resize touch-none" role="separator" aria-label="Kéo để thay đổi kích thước danh sách hội thoại" aria-orientation="vertical" onPointerDown={onResizeStart} />
  </aside>;
}
