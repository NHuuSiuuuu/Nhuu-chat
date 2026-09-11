import * as React from "react";
import { useState } from "react";
import { InboxIcon } from "./InboxIcon.js";

type SidebarTab = "info" | "create-order";

function NoteBlock() {
  return <section className="rounded-xl bg-gray-50 p-3" aria-labelledby="conversation-note-title">
    <h3 className="mb-3 text-sm font-bold text-gray-800" id="conversation-note-title">Ghi chú</h3>
    <div className="grid justify-items-center rounded-lg px-2 py-4 text-center text-gray-400">
      <InboxIcon name="note" size={34} />
      <p className="mt-2 text-xs font-medium">Bạn chưa có ghi chú nào</p>
    </div>
    <input className="mt-3 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-800 outline-none placeholder:text-gray-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-600/10" aria-label="Ghi chú hội thoại" placeholder="Nhập ghi chú (Enter để gửi)" />
  </section>;
}

function OrderBlock() {
  return <section className="mt-5" aria-labelledby="conversation-order-title">
    <h3 className="mb-3 text-sm font-bold text-gray-800" id="conversation-order-title">Đơn hàng</h3>
    <div className="grid justify-items-center rounded-xl border-2 border-dashed border-gray-200 px-3 py-6 text-center text-gray-400">
      <div className="relative grid size-12 place-items-center rounded-full bg-gray-100"><InboxIcon name="list" size={26} /><span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-white text-[10px] font-bold text-gray-400 shadow-sm">0</span></div>
      <p className="mt-3 text-xs">Chưa có lịch sử đơn hàng</p>
      <button className="mt-4 inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 shadow-sm transition hover:border-gray-300 hover:shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300" type="button"><InboxIcon name="plus" size={14} /> + Tạo đơn</button>
    </div>
  </section>;
}

function CreateOrderPanel() {
  return <section className="rounded-xl border border-gray-200 bg-gray-50 p-4" aria-labelledby="create-order-title">
    <h3 className="text-sm font-bold text-gray-800" id="create-order-title">Tạo đơn</h3>
    <p className="mt-3 text-xs leading-5 text-gray-500">Bắt đầu tạo đơn hàng từ hội thoại này.</p>
    <button className="mt-4 inline-flex w-full items-center justify-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300" type="button"><InboxIcon name="plus" size={14} /> + Tạo đơn</button>
  </section>;
}

function SidebarContent({ activeTab, setActiveTab }: { activeTab: SidebarTab; setActiveTab: (tab: SidebarTab) => void }) {
  return <>
    <nav className="flex shrink-0 border-b border-gray-200 px-4" aria-label="Khu vực thông tin bổ trợ">
      <button className={`border-b-2 px-3 py-3 text-xs font-semibold transition ${activeTab === "info" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`} type="button" onClick={() => setActiveTab("info")} aria-selected={activeTab === "info"}>Thông tin</button>
      <button className={`border-b-2 px-3 py-3 text-xs font-semibold transition ${activeTab === "create-order" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`} type="button" onClick={() => setActiveTab("create-order")} aria-selected={activeTab === "create-order"}>Tạo đơn</button>
    </nav>
    <div className="min-h-0 flex-1 overflow-y-auto scrollbar-none p-4">{activeTab === "info" ? <><NoteBlock /><OrderBlock /></> : <CreateOrderPanel />}</div>
  </>;
}

function SidebarPanel({ mobile = false, onClose }: { mobile?: boolean; onClose?: () => void }) {
  const [activeTab, setActiveTab] = useState<SidebarTab>("info");
  return <aside className={mobile ? "fixed inset-y-0 right-0 z-50 flex w-[min(340px,calc(100vw-44px))] flex-col border-l border-gray-200 bg-white shadow-2xl" : "hidden min-h-0 w-[300px] shrink-0 flex-col border-l border-gray-200 bg-white min-[1180px]:flex"} aria-label="Thông tin bổ trợ cuộc hội thoại">
    {mobile && <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3"><span className="text-sm font-bold text-gray-800">Thông tin hội thoại</span><button className="grid size-8 place-items-center rounded-md text-gray-500 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300" type="button" onClick={onClose} aria-label="Đóng thông tin hội thoại"><InboxIcon name="close" size={17} /></button></div>}
    <SidebarContent activeTab={activeTab} setActiveTab={setActiveTab} />
  </aside>;
}

export function ConversationInfoSidebar({ mobileOpen = false, onClose }: { mobileOpen?: boolean; onClose?: () => void }) {
  return <>{<SidebarPanel />}{mobileOpen && <><button className="fixed inset-0 z-40 bg-slate-900/30 min-[1180px]:hidden" type="button" onClick={onClose} aria-label="Đóng bảng thông tin" /><SidebarPanel mobile onClose={onClose} /></>}</>;
}
