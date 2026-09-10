import * as React from "react";
import { useMemo, useState } from "react";
import type { ConversationContract } from "@nhuu-chat/contracts";
import { conversationAccountName, conversationDisplayName, formatConversationTime, conversationPlatformLabel } from "../../state/inbox-ui.js";
import { InboxIcon } from "./InboxIcon.js";
import { ConversationAvatar } from "./ConversationAvatar.js";
import { PlatformIcon } from "../dashboard/PlatformIcon.js";

interface ConversationListProps {
  items: ConversationContract[];
  activeId: string | null;
  onSelect: (id: string) => void;
  collapsed?: boolean;
  onResizeStart?: (event: React.PointerEvent<HTMLDivElement>) => void;
}
function platformIconProvider(platform: ConversationContract["platform"]) {
  return platform === "telegram_personal" ? "telegram" : platform;
}

export function ConversationList({ items, activeId, onSelect, collapsed = false, onResizeStart }: ConversationListProps) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(
    () => items.filter((item) => `${item.channelId} ${item.lastMessageSnippet} ${item.customerName ?? ""} ${item.conversationName ?? ""} ${conversationPlatformLabel(item.platform)}`.toLowerCase().includes(search.toLowerCase())),
    [items, search]
  );

  return <aside className={`relative rounded-tl-lg conversation-sidebar flex min-w-0 flex-col overflow-hidden border-r border-gray-200 bg-white transition-[width] duration-200 ${collapsed ? "w-[72px]" : "w-full"}`} aria-label="Danh sách hội thoại">
    <div className={`${collapsed ? "flex min-h-[66px] items-center justify-center p-3" : "conversation-toolbar grid grid-cols-[minmax(0,1fr)_82px_40px] gap-2 p-3 max-[680px]:grid-cols-[minmax(0,1fr)_40px]"}`}>
      {collapsed ? <span className="text-gray-400" title="Kéo để thay đổi kích thước danh sách hội thoại"><InboxIcon name="list" /></span> : <><label className="conversation-search flex h-10 min-w-0 items-center gap-2 rounded-lg border border-gray-200 px-2.5 text-gray-400 transition-shadow focus-within:border-blue-300 focus-within:ring-4 focus-within:ring-blue-600/10"><InboxIcon name="search" size={17} /><input className="w-full min-w-0 border-0 bg-transparent text-sm text-gray-800 outline-none placeholder:text-gray-400" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm tên, sđt..." aria-label="Tìm hội thoại" /></label><button className="conversation-filter flex h-10 items-center justify-around rounded-lg border border-gray-200 bg-white text-[13px] text-gray-600 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300 max-[680px]:hidden" type="button"><span>Tất cả</span><span aria-hidden="true">⌄</span></button><button className="conversation-add grid h-10 place-items-center rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300" type="button" aria-label="Thêm hội thoại"><InboxIcon name="plus" /></button></>}
    </div>
    {!collapsed && <div className="conversation-list-header flex min-h-11 items-center justify-between border-y border-gray-200 px-3 text-sm font-semibold text-gray-600"><span>Tất cả hội thoại <b className="ml-1 rounded-full bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-500">{items.length}</b></span><button className="grid place-items-center text-gray-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300" type="button" aria-label="Tùy chọn danh sách"><InboxIcon name="list" /></button></div>}
    <div className={`conversation-items min-h-0 overflow-y-auto ${collapsed ? "py-2" : ""}`}>
      {filtered.length === 0 ? <div className="conversation-list-empty px-4 py-10 text-center text-[13px] text-gray-400">{collapsed ? "" : "Chưa có hội thoại"}</div> : filtered.map((item) => {
        const name = conversationDisplayName(item);
        const accountName = conversationAccountName({ accountName: item.accountName, platform: item.platform });
        const platform = platformIconProvider(item.platform);
        return <button className={`conversation-item relative flex min-h-[88px] w-full items-start gap-3 border-0 border-b border-gray-100 text-left text-gray-800 transition-colors hover:bg-slate-50 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300 ${collapsed ? "justify-center px-2 py-3" : "px-3 py-3.5"} ${item.id === activeId ? "bg-blue-50" : "bg-white"}`} key={item.id} onClick={() => onSelect(item.id)} aria-current={item.id === activeId} title={collapsed ? name : undefined}>
          <ConversationAvatar name={name} avatarUrl={item.customerAvatarUrl} isGroup={item.conversationType === "group"} size={collapsed ? "size-[42px]" : "size-[48px]"} />
          <span className={`conversation-item-content grid min-w-0 flex-1 gap-1 ${collapsed ? "hidden" : ""}`}>
            <span className="conversation-item-top flex min-w-0 items-center justify-between gap-2">
              <strong className="min-w-0 truncate text-sm font-semibold text-gray-900">{name}</strong>
              <time className="shrink-0 text-[11px] text-gray-400">{formatConversationTime(item.lastMessageAt)}</time>
            </span>
            <span className="flex min-w-0 items-center gap-2">
              <span className="conversation-preview min-w-0 flex-1 truncate text-xs text-gray-500">{item.lastMessageSnippet || "Hội thoại mới"}</span>
            </span>
              <span className="conversation-account flex min-w-0 items-center gap-1.5 leading-4 text-[11px] text-gray-400"><ConversationAvatar name={accountName} avatarUrl={item.accountAvatarUrl} size="size-4" /><span className="min-w-0 truncate leading-4">{accountName}</span>{item.tags?.length ? <span className="flex min-w-0 items-center gap-1">{item.tags.slice(0, 2).map((tag) => <span className="conversation-tag max-w-[88px] truncate rounded-full px-2 py-0.5 text-[10px] font-bold text-white" style={{ backgroundColor: tag.color }} key={tag.id}>{tag.name}</span>)}</span> : null}<span className="ml-auto shrink-0" title={conversationPlatformLabel(item.platform)}><PlatformIcon provider={platform} size={15} plain /></span></span>
          </span>
          {item.unreadCount > 0 && <span className={`conversation-unread grid size-5 shrink-0 place-items-center rounded-full bg-red-500 text-[11px] font-bold text-white ${collapsed ? "absolute right-1 top-1" : ""}`}>{item.unreadCount > 99 ? "99+" : item.unreadCount}</span>}
        </button>;
      })}
    </div>
    <div className="absolute inset-y-0 right-0 z-10 w-2 cursor-col-resize touch-none" role="separator" aria-label="Kéo để thay đổi kích thước danh sách hội thoại" aria-orientation="vertical" onPointerDown={onResizeStart} />
  </aside>;
}
