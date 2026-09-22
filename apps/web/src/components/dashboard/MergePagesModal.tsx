import * as React from "react";

import { InboxIcon } from "../conversations/InboxIcon.js";
import { PlatformIcon } from "./PlatformIcon.js";

export interface MergePageOption {
  id: string;
  name: string;
  platform: "telegram" | "zalo" | "facebook";
  username?: string;
  avatarUrl?: string | null;
}

export function filterMergePages(pages: MergePageOption[], query: string): MergePageOption[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return pages;
  return pages.filter((page) => `${page.name} ${page.username ?? ""} ${page.platform}`.toLowerCase().includes(normalizedQuery));
}

export function selectAllMergePages(pages: MergePageOption[], query: string, selectedIds: Set<string>): Set<string> {
  const nextSelectedIds = new Set(selectedIds);
  filterMergePages(pages, query).forEach((page) => nextSelectedIds.add(page.id));
  return nextSelectedIds;
}

export function MergePagesModal({ pages, selectedIds, searchQuery, onSearchChange, onTogglePage, onSelectAll, onClose, onMerge }: {
  pages: MergePageOption[];
  selectedIds: Set<string>;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onTogglePage: (pageId: string) => void;
  onSelectAll: () => void;
  onClose: () => void;
  onMerge: () => void;
}) {
  const visiblePages = filterMergePages(pages, searchQuery);

  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="flex max-h-[min(680px,calc(100vh-2rem))] w-full max-w-[520px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="merge-pages-title" onMouseDown={(event) => event.stopPropagation()}>
      <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <h2 className="text-lg font-bold text-slate-900" id="merge-pages-title">Chọn pages để chat</h2>
        <button className="grid size-9 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400" type="button" aria-label="Đóng" onClick={onClose}><InboxIcon name="close" size={19} /></button>
      </header>
      <div className="grid gap-4 px-5 py-4">
        <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-slate-400 focus-within:border-sky-400 focus-within:ring-2 focus-within:ring-sky-100"><InboxIcon name="search" size={18} /><input className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400" value={searchQuery} onChange={(event) => onSearchChange(event.target.value)} placeholder="Tìm page" aria-label="Tìm page" /></label>
        <div className="flex items-center justify-between gap-3 text-sm"><span className="text-slate-500">Đã chọn: <strong className="text-slate-800">{selectedIds.size}</strong></span><button className="font-semibold text-sky-600 hover:text-sky-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400" type="button" onClick={onSelectAll}>Chọn tất cả</button></div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4" aria-label="Danh sách Page">
        <div className="grid gap-2">
          {visiblePages.map((page) => {
            const isSelected = selectedIds.has(page.id);
            const avatarUrl = page.avatarUrl?.trim();
            return <button className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 ${isSelected ? "border-sky-300 bg-sky-50" : "border-slate-200 hover:border-sky-200 hover:bg-slate-50"}`} type="button" key={page.id} aria-pressed={isSelected} onClick={() => onTogglePage(page.id)}>
              <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-lg bg-gradient-to-br from-slate-700 to-slate-900 text-sm font-bold text-white">{avatarUrl ? <img className="size-full object-cover" src={avatarUrl} alt="" /> : page.name.slice(0, 1).toUpperCase()}</span>
              <span className="min-w-0 flex-1"><strong className="block truncate text-sm text-slate-800">{page.name}</strong><small className="mt-1 flex items-center gap-1.5 truncate text-xs text-slate-500"><PlatformIcon provider={page.platform} size={14} />{page.username ? `@${page.username}` : page.platform === "facebook" ? "Facebook" : page.platform === "zalo" ? "Zalo" : "Telegram"}</small></span>
              <span className={`grid size-5 shrink-0 place-items-center rounded-full border ${isSelected ? "border-sky-600 bg-sky-600 text-white" : "border-slate-300 text-transparent"}`} aria-hidden="true"><InboxIcon name="check" size={13} /></span>
            </button>;
          })}
          {visiblePages.length === 0 && <p className="py-8 text-center text-sm text-slate-500">Không tìm thấy page phù hợp.</p>}
        </div>
      </div>
      <footer className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-4">
        <button className="rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-500 transition hover:bg-slate-50 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400" type="button" onClick={onClose}>Đóng</button>
        <button className="rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 disabled:cursor-not-allowed disabled:opacity-50" type="button" disabled={selectedIds.size === 0} onClick={onMerge}>Gộp Page</button>
      </footer>
    </section>
  </div>;
}
