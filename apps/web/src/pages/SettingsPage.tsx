import * as React from "react";
import { useState } from "react";
import { DashboardTopbar } from "../components/dashboard/DashboardTopbar.js";
import { InboxIcon } from "../components/conversations/InboxIcon.js";

const settingsItems = ["Cài đặt chung", "Thẻ hội thoại", "Trợ lý AI", "Hỗ trợ trả lời", "Giao diện", "Cuộc gọi", "Chế độ xoay vòng", "Đồng bộ", "Công cụ", "Phân quyền", "Lịch sử"];
const tagColors = ["#8b5cf6", "#38bdf8", "#64748b", "#a78bfa", "#22c55e", "#ec4899"];
const pickerColors = ["#9ca3af", "#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6", "#3b82f6", "#8b5cf6", "#ec4899", "#38bdf8"];

interface SettingsPageProps {
  onLogoClick?: () => void;
  onNavigate?: (item: "Hội thoại" | "Đơn hàng" | "Bài viết" | "Thống kê" | "Cài đặt") => void;
}

export function SettingsPage({ onLogoClick, onNavigate }: SettingsPageProps) {
  const [activeTab, setActiveTab] = useState("Cài đặt chung");
  const [isAddTagModalOpen, setIsAddTagModalOpen] = useState(false);
  const [tagName, setTagName] = useState("");
  const [selectedColor, setSelectedColor] = useState(pickerColors[6]);
  const [tags, setTags] = useState(["Câu hỏi", "Hết hàng", "Kiểm hàng", "Mua hàng", "Đã gửi", "Trả hàng"].map((name, index) => ({ name, color: tagColors[index] })));

  function saveTag(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = tagName.trim();
    if (!name) return;
    setTags((current) => [...current, { name, color: selectedColor }]);
    setTagName("");
    setIsAddTagModalOpen(false);
  }

  return <main className="min-h-screen bg-gray-50 text-gray-800"><DashboardTopbar onLogoClick={onLogoClick} onNavigate={onNavigate} /><div className="mx-auto flex w-full max-w-6xl gap-6 px-6 py-8 max-[800px]:flex-col max-[800px]:px-4"><aside className="h-fit w-64 shrink-0 rounded-2xl bg-white p-3 shadow-sm max-[800px]:w-full"><h1 className="px-3 pb-3 text-lg font-bold">Cài đặt</h1><nav className="grid gap-1" aria-label="Menu cài đặt">{settingsItems.map((item) => <button className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${activeTab === item ? "bg-sky-50 font-semibold text-sky-700" : "text-gray-600 hover:bg-gray-50"}`} key={item} type="button" onClick={() => setActiveTab(item)}><InboxIcon name={item === "Thẻ hội thoại" ? "tag" : item === "Trợ lý AI" ? "sparkles" : "settings"} size={17} /> <span>{item}</span>{item === "Trợ lý AI" && <small className="ml-auto rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">Beta</small>}</button>)}</nav></aside><section className="min-w-0 flex-1"><h2 className="mb-5 text-2xl font-bold text-gray-900">{activeTab}</h2><div className="rounded-2xl bg-white p-6 shadow-sm"><div className="flex items-start justify-between gap-4"><p className="max-w-2xl text-sm leading-6 text-gray-500">Thẻ dùng để đánh dấu trạng thái hội thoại trong Livechat (vd "Mua hàng", "Đã gửi") — 1 hội thoại có thể gắn nhiều thẻ cùng lúc.</p><button className="shrink-0 rounded-lg bg-sky-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500" type="button" onClick={() => setIsAddTagModalOpen(true)}><span className="mr-1">+</span> Thêm thẻ</button></div><div className="mt-7 flex flex-wrap gap-3">{tags.map((tag) => <span className="group inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:scale-[1.02]" style={{ backgroundColor: tag.color }} key={`${tag.name}-${tag.color}`}>{tag.name}<span className="flex gap-1 opacity-60 transition group-hover:opacity-100"><button type="button" aria-label={`Sửa ${tag.name}`}><InboxIcon name="edit" size={14} /></button><button type="button" aria-label={`Xóa ${tag.name}`}><InboxIcon name="trash" size={14} /></button></span></span>)}</div></div></section></div>{isAddTagModalOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4" role="presentation" onMouseDown={() => setIsAddTagModalOpen(false)}><section className="w-full max-w-md animate-[composer-dialog-in_180ms_ease-out] rounded-2xl bg-white p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="add-tag-title" onMouseDown={(event) => event.stopPropagation()}><div className="flex items-center justify-between"><h3 className="text-lg font-bold" id="add-tag-title">Thêm thẻ hội thoại</h3><button className="grid size-8 place-items-center rounded-lg text-gray-500 hover:bg-gray-100" type="button" onClick={() => setIsAddTagModalOpen(false)} aria-label="Đóng"><InboxIcon name="close" /></button></div><form className="mt-5 grid gap-4" onSubmit={saveTag}><label className="grid gap-1.5 text-sm font-semibold">Tên thẻ<input className="rounded-lg border border-gray-200 px-3 py-2.5 font-normal outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100" placeholder="Vd: Mua hàng" value={tagName} onChange={(event) => setTagName(event.target.value)} /></label><fieldset><legend className="mb-2 text-sm font-semibold">Màu thẻ</legend><div className="flex flex-wrap gap-2">{pickerColors.map((color) => <button className={`size-7 rounded-full ${selectedColor === color ? "ring-2 ring-black ring-offset-2" : ""}`} style={{ backgroundColor: color }} type="button" aria-label={`Chọn màu ${color}`} key={color} onClick={() => setSelectedColor(color)} />)}</div><label className="flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 hover:border-sky-400 hover:text-sky-700"><input className="size-7 cursor-pointer rounded border-0 p-0" type="color" value={selectedColor} onChange={(event) => setSelectedColor(event.target.value)} aria-label="Tùy chỉnh màu" /><span>Tùy chỉnh màu</span></label></fieldset><button className="w-fit rounded-lg bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-700" type="button">Xem trước</button><div className="mt-2 flex justify-end gap-2"><button className="rounded-lg px-4 py-2 text-sm font-semibold text-gray-500 hover:bg-gray-50" type="button" onClick={() => setIsAddTagModalOpen(false)}>Huỷ</button><button className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700" type="submit">Lưu</button></div></form></section></div>}</main>;
}
