import * as React from "react";
import { useEffect, useState } from "react";
import type { AiModelTier, AiSentimentWindow, AiSettingsContract, AiSuggestionMode, ConversationTagContract, QuickReplyContract } from "@nhuu-chat/contracts";
import { DashboardTopbar } from "../components/dashboard/DashboardTopbar.js";
import { InboxIcon } from "../components/conversations/InboxIcon.js";
import { apiRequest } from "../lib/api.js";
import { resolveApiBaseUrl } from "../lib/api-url.js";

const API_URL = resolveApiBaseUrl(import.meta.env.VITE_API_URL);
const TAGS_API_PATH = "/api/v1/conversation-tags";
const AI_SETTINGS_API_PATH = "/api/v1/ai-settings";
const QUICK_REPLIES_API_PATH = "/api/v1/quick-replies";
const DEFAULT_AI_SETTINGS: AiSettingsContract = { modelTier: "smart", enabled: true, suggestionsEnabled: true, sentimentEnabled: true, suggestionMode: "on_open", sentimentWindow: 3 };
const modelTierByLabel: Record<string, AiModelTier> = { "Thông minh nhất": "smart", "Cân bằng": "balanced", "Tiết kiệm": "economy" };
const modelLabelByTier: Record<AiModelTier, string> = { smart: "Thông minh nhất", balanced: "Cân bằng", economy: "Tiết kiệm" };
const suggestionModeByLabel: Record<string, AiSuggestionMode> = { "Thủ công": "manual", "Khi mở hội thoại": "on_open", "Khi khách nhắn tin": "on_customer_message", "Luôn gợi ý": "on_customer_message" };
const suggestionLabelByMode: Record<AiSuggestionMode, string> = { off: "Thủ công", manual: "Thủ công", on_open: "Khi mở hội thoại", on_customer_message: "Khi khách nhắn tin" };
const sentimentWindowByLabel: Record<string, AiSentimentWindow> = { "3 tin gần nhất": 3, "6 tin gần nhất": 6, "10 tin gần nhất": 10 };
const sentimentLabelByWindow: Record<AiSentimentWindow, string> = { 3: "3 tin gần nhất", 6: "6 tin gần nhất", 10: "10 tin gần nhất" };
const pickerColors = ["#9ca3af", "#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6", "#3b82f6", "#8b5cf6", "#ec4899", "#38bdf8"];
const settingsItems = ["Cài đặt chung", "Thẻ hội thoại", "Trợ lý AI", "Hỗ trợ trả lời", "Giao diện", "Cuộc gọi", "Chế độ xoay vòng", "Đồng bộ", "Công cụ", "Phân quyền", "Lịch sử"] as const;
const settingsIconByItem = {
  "Cài đặt chung": "settings",
  "Thẻ hội thoại": "tag",
  "Trợ lý AI": "sparkles",
  "Hỗ trợ trả lời": "chat",
  "Giao diện": "monitor",
  "Cuộc gọi": "phone",
  "Chế độ xoay vòng": "refresh",
  "Đồng bộ": "cloud",
  "Công cụ": "wrench",
  "Phân quyền": "users",
  "Lịch sử": "clock"
} as const;

type AiAssistantTab = "Gợi ý trả lời" | "Chatbot tự động";

function AiToggle({ checked, label, onChange }: { checked: boolean; label: string; onChange: (value: boolean) => void }) {
  return <button className={`relative inline-flex h-6 w-11 shrink-0 items-center justify-start border-0 p-0 rounded-full transition-colors ${checked ? "bg-sky-500" : "bg-gray-300"}`} type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}><span className={`absolute left-1 top-1 size-4 rounded-full bg-white shadow-sm transition-transform ${checked ? "translate-x-5" : "translate-x-0"}`} /></button>;
}

function AiSelect({ value, options, label, onChange }: { value: string; options: string[]; label: string; onChange: (value: string) => void }) {
  return <select className="min-w-0 max-w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100" aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option}>{option}</option>)}</select>;
}

function AiSettingItem({ icon, iconClassName, title, description, children, footer }: { icon: "sparkles" | "cloud" | "chat" | "smile"; iconClassName: string; title: string; description: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode }) {
  return <article className="flex flex-wrap items-start gap-4 border-b border-gray-100 py-5 last:border-b-0"><span className={`grid size-11 shrink-0 place-items-center rounded-full ${iconClassName}`}><InboxIcon name={icon} size={20} /></span><div className="min-w-[220px] flex-1"><h3 className="font-semibold text-gray-900">{title}</h3><div className="mt-1 max-w-2xl text-sm leading-6 text-gray-500">{description}</div>{footer && <div className="mt-2">{footer}</div>}</div><div className="flex min-w-0 shrink-0 flex-wrap items-center justify-end gap-3 max-[640px]:w-full">{children}</div></article>;
}

function AiAssistantSettings({ token, refresh }: { token: string; refresh?: () => Promise<string | null> }) {
  const [activeAiTab, setActiveAiTab] = useState<AiAssistantTab>("Gợi ý trả lời");
  const [model, setModel] = useState("Thông minh nhất");
  const [modelEnabled, setModelEnabled] = useState(true);
  const [wallet, setWallet] = useState("Test WA $62.18");
  const [suggestionTiming, setSuggestionTiming] = useState("Khi mở hội thoại");
  const [suggestionsEnabled, setSuggestionsEnabled] = useState(true);
  const [sentimentMessages, setSentimentMessages] = useState("3 tin gần nhất");
  const [sentimentEnabled, setSentimentEnabled] = useState(true);
  const [aiSettings, setAiSettings] = useState<AiSettingsContract>(DEFAULT_AI_SETTINGS);

  useEffect(() => {
    let active = true;
    void apiRequest<AiSettingsContract>(API_URL, AI_SETTINGS_API_PATH, token, {}, refresh).then((settings) => {
      if (!active) return;
      setAiSettings(settings);
      setModel(modelLabelByTier[settings.modelTier]);
      setModelEnabled(settings.enabled);
      setSuggestionsEnabled(settings.suggestionsEnabled);
      setSuggestionTiming(suggestionLabelByMode[settings.suggestionMode]);
      setSentimentMessages(sentimentLabelByWindow[settings.sentimentWindow]);
      setSentimentEnabled(settings.sentimentEnabled);
    });
    return () => { active = false; };
  }, [refresh, token]);

  async function onSettingsChange(patch: Partial<AiSettingsContract>) {
    const next = { ...aiSettings, ...patch };
    setAiSettings(next);
    try {
      const saved = await apiRequest<AiSettingsContract>(API_URL, AI_SETTINGS_API_PATH, token, { method: "PATCH", body: JSON.stringify(patch) }, refresh);
      setAiSettings(saved);
    } catch {
      // Keep the local control responsive when the settings request is temporarily unavailable.
    }
  }

  return <div className="rounded-2xl bg-white p-5 shadow-sm sm:p-7"><div className="flex flex-wrap items-center justify-between gap-4"><h2 className="text-2xl font-bold text-gray-900">Trợ lý AI</h2><span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-700">Beta</span></div><div className="mt-6 flex gap-2 border-b border-gray-100 pb-3"><button className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${activeAiTab === "Gợi ý trả lời" ? "bg-sky-500 text-white" : "text-gray-500 hover:bg-gray-50"}`} type="button" onClick={() => setActiveAiTab("Gợi ý trả lời")}>Gợi ý trả lời</button><button className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${activeAiTab === "Chatbot tự động" ? "bg-sky-500 text-white" : "text-gray-500 hover:bg-gray-50"}`} type="button" onClick={() => setActiveAiTab("Chatbot tự động")}>Chatbot tự động</button></div>{activeAiTab === "Gợi ý trả lời" ? <div><AiSettingItem icon="sparkles" iconClassName="bg-purple-50 text-purple-600" title="Mô hình AI" description="NHuuChat cung cấp 3 tuỳ chọn AI khác nhau. Model thông minh nhất, chi phí sẽ cao hơn nhưng chất lượng sẽ tốt nhất."><AiSelect label="Mô hình AI" value={model} options={["Thông minh nhất", "Cân bằng", "Tiết kiệm"]} onChange={(value) => { setModel(value); void onSettingsChange({ modelTier: modelTierByLabel[value] }); }} /><AiToggle checked={modelEnabled} label="Bật mô hình AI" onChange={(value) => { setModelEnabled(value); void onSettingsChange({ enabled: value }); }} /></AiSettingItem><AiSettingItem icon="cloud" iconClassName="bg-sky-50 text-sky-500" title="Thanh toán" description={<>Phí sử dụng tính năng AI sẽ được trừ trực tiếp từ ví Pancake bạn chọn. Hãy nạp tiền vào ví để đảm bảo dịch vụ không bị gián đoạn. <button className="ml-1 font-semibold text-sky-600 hover:underline" type="button">Nạp tiền</button></>}><AiSelect label="Ví thanh toán" value={wallet} options={["Test WA $62.18"]} onChange={setWallet} /></AiSettingItem><AiSettingItem icon="chat" iconClassName="bg-amber-50 text-amber-500" title="Gợi ý trả lời tin nhắn từ AI" description={<>Tự động hiển thị <strong>3 câu gợi ý</strong> trả lời tin nhắn dựa trên nội dung cuộc trò chuyện gần nhất giúp bạn phản hồi nhanh hơn.</>} footer={<button className="text-sm font-semibold text-sky-600 hover:underline" type="button">Tuỳ chỉnh</button>}><AiSelect label="Thời điểm gợi ý" value={suggestionTiming} options={["Khi mở hội thoại", "Khi khách nhắn tin", "Luôn gợi ý", "Thủ công"]} onChange={(value) => { setSuggestionTiming(value); void onSettingsChange({ suggestionMode: suggestionModeByLabel[value] }); }} /><AiToggle checked={suggestionsEnabled} label="Bật gợi ý trả lời" onChange={(value) => { setSuggestionsEnabled(value); void onSettingsChange({ suggestionsEnabled: value }); }} /></AiSettingItem><AiSettingItem icon="smile" iconClassName="bg-emerald-50 text-emerald-600" title="Phát hiện cảm xúc của khách hàng" description="Tự động phân tích và hiển thị sắc thái cảm xúc khách hàng trong cuộc trò chuyện. Tăng độ chính xác bằng cách cho AI truy cập nhiều tin nhắn cũ hơn." footer={<div className="grid gap-1 text-sm text-gray-500"><span>Khi khách hàng <strong>Không hài lòng</strong> hoặc <strong>giận dữ</strong>, <strong>tiêu cực</strong>:</span><span>Khi phát hiện, tự động</span><span className="mt-1 inline-flex w-fit items-center gap-1 rounded-full bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-700">AI Sentiment <button type="button" aria-label="Xóa AI Sentiment"><InboxIcon name="close" size={13} /></button></span></div>}><AiSelect label="Số tin nhắn cảm xúc" value={sentimentMessages} options={["3 tin gần nhất", "6 tin gần nhất", "10 tin gần nhất"]} onChange={(value) => { setSentimentMessages(value); void onSettingsChange({ sentimentWindow: sentimentWindowByLabel[value] }); }} /><AiToggle checked={sentimentEnabled} label="Bật phát hiện cảm xúc" onChange={(value) => { setSentimentEnabled(value); void onSettingsChange({ sentimentEnabled: value }); }} /></AiSettingItem></div> : <div className="grid min-h-56 place-items-center py-12 text-center text-sm text-gray-500">Chatbot tự động đang được phát triển.</div>}</div>;
}

type QuickReplyDraft = Pick<QuickReplyContract, "shortcut" | "message"> & { attachment?: File };

function QuickReplyModal({ reply, isSaving, error, onClose, onSave }: { reply: QuickReplyContract | null; isSaving: boolean; error: string | null; onClose: () => void; onSave: (reply: QuickReplyDraft) => Promise<boolean> }) {
  const [shortcut, setShortcut] = useState(reply?.shortcut ?? "");
  const [message, setMessage] = useState(reply?.message ?? "");
  const [attachment, setAttachment] = useState<File | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextShortcut = shortcut.trim();
    const nextMessage = message.trim();
    if (!nextShortcut || !nextMessage) return;
    const saved = await onSave({ shortcut: nextShortcut, message: nextMessage, ...(attachment ? { attachment } : {}) });
    if (saved) setAttachment(null);
  }

  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4 backdrop-blur-sm" role="presentation" onMouseDown={onClose}>
    <section className="w-full max-w-lg animate-[composer-dialog-in_180ms_ease-out] rounded-2xl bg-white p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="quick-reply-title" onMouseDown={(event) => event.stopPropagation()}>
      <div className="flex items-center justify-between gap-4"><h3 className="text-lg font-bold text-gray-900" id="quick-reply-title">{reply ? "Sửa mẫu trả lời nhanh" : "Thêm mẫu trả lời nhanh"}</h3><button className="grid size-8 place-items-center rounded-lg text-gray-500 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50" type="button" onClick={onClose} aria-label="Đóng" disabled={isSaving}><InboxIcon name="close" /></button></div>
      <form className="mt-6 grid gap-5" onSubmit={submit}>
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">{error}</p>}
        <label className="grid gap-2 text-sm font-semibold text-gray-800">Ký tự tắt<input className="rounded-lg border border-gray-300 px-3 py-2.5 font-normal outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500" placeholder="Vd: cskh" value={shortcut} onChange={(event) => setShortcut(event.target.value)} /></label>
        <label className="grid gap-2 text-sm font-semibold text-gray-800">Tin nhắn<textarea className="min-h-28 resize-y rounded-lg border border-gray-300 px-3 py-2.5 font-normal outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500" placeholder="Nội dung sẽ được chèn khi gõ ký tự tắt ở trên" value={message} onChange={(event) => setMessage(event.target.value)} /></label>
        <div className="grid gap-2 text-sm font-semibold text-gray-800"><span>Ảnh đính kèm</span><label className="flex cursor-pointer items-center gap-2 rounded-lg border-2 border-dashed border-gray-300 px-3 py-3 text-left font-normal text-gray-600 transition hover:border-blue-400 hover:text-blue-600" htmlFor="quick-reply-attachment"><InboxIcon name="image" size={18} /> {attachment ? attachment.name : "Chọn ảnh từ thư viện"}</label><input className="sr-only" id="quick-reply-attachment" type="file" accept="image/*" disabled={isSaving} onChange={(event) => setAttachment(event.target.files?.[0] ?? null)} />{attachment && <button className="w-fit text-xs font-semibold text-gray-500 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50" type="button" disabled={isSaving} onClick={() => setAttachment(null)}>Xoá ảnh đính kèm</button>}</div>
        <div className="mt-1 flex justify-end gap-2"><button className="rounded-lg px-4 py-2 text-sm font-semibold text-gray-500 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50" type="button" onClick={onClose} disabled={isSaving}>Huỷ</button><button className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60" type="submit" disabled={isSaving}>{isSaving ? "Đang lưu..." : "Lưu"}</button></div>
      </form>
    </section>
  </div>;
}

function QuickReplySettings({ token, refresh }: { token: string; refresh?: () => Promise<string | null> }) {
  const [quickReplies, setQuickReplies] = useState<QuickReplyContract[]>([]);
  const [search, setSearch] = useState("");
  const [isAddQuickReplyModalOpen, setIsAddQuickReplyModalOpen] = useState(false);
  const [editingQuickReply, setEditingQuickReply] = useState<QuickReplyContract | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const filteredReplies = quickReplies.filter((reply) => `${reply.shortcut} ${reply.message}`.toLowerCase().includes(search.toLowerCase()));

  async function loadQuickReplies() {
    setIsLoading(true);
    setPageError(null);
    try {
      const result = await apiRequest<{ quickReplies: QuickReplyContract[] }>(API_URL, QUICK_REPLIES_API_PATH, token, { method: "GET" }, refresh);
      setQuickReplies(result.quickReplies);
    } catch {
      setPageError("Không thể tải danh sách trả lời nhanh");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { void loadQuickReplies(); }, [refresh, token]);

  function closeQuickReplyModal() { setIsAddQuickReplyModalOpen(false); setEditingQuickReply(null); }
  function openAddQuickReplyModal() { setEditingQuickReply(null); setModalError(null); setIsAddQuickReplyModalOpen(true); }
  function openEditQuickReplyModal(reply: QuickReplyContract) { setEditingQuickReply(reply); setModalError(null); setIsAddQuickReplyModalOpen(true); }

  async function saveQuickReply(reply: QuickReplyDraft) {
    const formData = new FormData();
    formData.append("shortcut", reply.shortcut);
    formData.append("message", reply.message);
    if (reply.attachment) formData.append("attachment", reply.attachment);
    setIsSaving(true);
    setModalError(null);
    try {
      const saved = await apiRequest<QuickReplyContract>(API_URL, editingQuickReply ? `${QUICK_REPLIES_API_PATH}/${editingQuickReply.id}` : QUICK_REPLIES_API_PATH, token, { method: editingQuickReply ? "PATCH" : "POST", body: formData }, refresh);
      setQuickReplies((current) => editingQuickReply ? current.map((item) => item.id === saved.id ? saved : item) : [...current, saved]);
      closeQuickReplyModal();
      return true;
    } catch {
      setModalError(reply.attachment ? "Không thể tải ảnh đính kèm" : editingQuickReply ? "Không thể cập nhật mẫu trả lời nhanh" : "Không thể thêm mẫu trả lời nhanh");
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  async function removeQuickReply(reply: QuickReplyContract) {
    if (!window.confirm(`Xóa mẫu trả lời nhanh "${reply.shortcut}"?`)) return;
    setDeletingId(reply.id);
    setActionError(null);
    try {
      await apiRequest<void>(API_URL, `${QUICK_REPLIES_API_PATH}/${reply.id}`, token, { method: "DELETE" }, refresh);
      setQuickReplies((current) => current.filter((item) => item.id !== reply.id));
    } catch {
      setActionError("Không thể xóa mẫu trả lời nhanh");
    } finally {
      setDeletingId(null);
    }
  }

  return <div className="rounded-2xl bg-white p-5 shadow-sm sm:p-7">
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100"><div className="border-b-2 border-blue-500 pb-3 text-sm font-semibold text-blue-600">Trả lời nhanh</div><div className="mb-3 flex flex-wrap items-center justify-end gap-2"><div className="flex gap-1 rounded-lg bg-gray-50 p-1">{[{ icon: "check" as const, label: "Chọn tất cả" }, { icon: "download" as const, label: "Xuất" }, { icon: "upload" as const, label: "Nhập" }, { icon: "file" as const, label: "Tệp" }].map((action) => <button className="grid size-8 place-items-center rounded-md text-gray-500 transition hover:bg-white hover:text-blue-600" type="button" aria-label={action.label} title={action.label} key={action.label}><InboxIcon name={action.icon} size={16} /></button>)}</div><button className="rounded-lg bg-blue-500 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60" type="button" onClick={openAddQuickReplyModal} disabled={isSaving}>Thêm mẫu</button></div></div>
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3"><h3 className="text-base font-semibold text-gray-900">Danh sách trả lời nhanh</h3><label className="flex w-full max-w-xs items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-400"><InboxIcon name="search" size={16} /><input className="min-w-0 flex-1 text-gray-700 outline-none placeholder:text-gray-400" placeholder="Tìm kiếm tin nhắn" value={search} onChange={(event) => setSearch(event.target.value)} /></label></div>
    {actionError && <p className="mt-4 text-sm text-rose-600" role="alert">{actionError}</p>}
    {pageError ? <p className="mt-7 text-sm text-rose-600" role="alert">{pageError}</p> : isLoading ? <p className="mt-7 text-sm text-gray-500">Đang tải mẫu trả lời nhanh...</p> : <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[640px] border-collapse text-left text-sm"><thead><tr className="border-y border-gray-100 text-xs uppercase tracking-wide text-gray-500"><th className="w-16 px-3 py-3 font-semibold">STT</th><th className="w-40 px-3 py-3 font-semibold">Ký tự tắt</th><th className="px-3 py-3 font-semibold">Tin nhắn</th><th className="w-24 px-3 py-3 font-semibold">Ảnh</th><th className="w-24 px-3 py-3 font-semibold">Thao tác</th></tr></thead><tbody>{filteredReplies.map((reply, index) => <tr className="border-b border-gray-100 text-gray-700" key={reply.id}><td className="px-3 py-4 text-gray-400">{index + 1}</td><td className="px-3 py-4 font-semibold text-gray-900">{reply.shortcut}</td><td className="px-3 py-4">{reply.message}</td><td className="px-3 py-4">{reply.attachment && <a className="inline-flex" href={reply.attachment.secureUrl} target="_blank" rel="noreferrer"><img className="size-10 rounded-md object-cover" src={reply.attachment.secureUrl} alt="Ảnh đính kèm của mẫu trả lời nhanh" /></a>}</td><td className="px-3 py-4"><div className="flex gap-1"><button className="grid size-8 place-items-center rounded-md text-gray-500 hover:bg-sky-50 hover:text-sky-600 disabled:cursor-not-allowed disabled:opacity-50" type="button" aria-label={`Sửa ${reply.shortcut}`} onClick={() => openEditQuickReplyModal(reply)} disabled={isSaving || deletingId === reply.id}><InboxIcon name="edit" size={15} /></button><button className="grid size-8 place-items-center rounded-md text-gray-500 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50" type="button" aria-label={`Xóa ${reply.shortcut}`} onClick={() => void removeQuickReply(reply)} disabled={isSaving || deletingId === reply.id}><InboxIcon name="trash" size={15} /></button></div></td></tr>)}{filteredReplies.length === 0 && <tr><td className="px-3 py-8 text-center text-gray-500" colSpan={5}>{quickReplies.length === 0 ? "Chưa có mẫu trả lời nhanh" : "Không tìm thấy tin nhắn"}</td></tr>}</tbody></table></div>}
    {isAddQuickReplyModalOpen && <QuickReplyModal reply={editingQuickReply} isSaving={isSaving} error={modalError} onClose={closeQuickReplyModal} onSave={saveQuickReply} />}
  </div>;
}

interface SettingsPageProps {
  token: string;
  refresh?: () => Promise<string | null>;
  onLogoClick?: () => void;
  onNavigate?: (item: "Hội thoại" | "Đơn hàng" | "Bài viết" | "Thống kê" | "Cài đặt") => void;
}

export function SettingsPage({ token, refresh, onLogoClick, onNavigate }: SettingsPageProps) {
  const [activeTab, setActiveTab] = useState("Cài đặt chung");
  const [isAddTagModalOpen, setIsAddTagModalOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<ConversationTagContract | null>(null);
  const [tagName, setTagName] = useState("");
  const [selectedColor, setSelectedColor] = useState(pickerColors[6]);
  const [tags, setTags] = useState<ConversationTagContract[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    void apiRequest<{ tags: ConversationTagContract[] }>(API_URL, TAGS_API_PATH, token, {}, refresh)
      .then((result) => { if (active) setTags(result.tags); })
      .catch(() => { if (active) setError("Không thể tải danh sách thẻ"); })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [refresh, token]);

  function openAddTagModal() {
    setEditingTag(null);
    setTagName("");
    setSelectedColor(pickerColors[6]);
    setError(null);
    setIsAddTagModalOpen(true);
  }

  function openEditTagModal(tag: ConversationTagContract) {
    setEditingTag(tag);
    setTagName(tag.name);
    setSelectedColor(tag.color);
    setError(null);
    setIsAddTagModalOpen(true);
  }

  function closeTagModal() {
    setIsAddTagModalOpen(false);
    setEditingTag(null);
  }

  async function saveTag(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = tagName.trim();
    if (!name) return;
    setIsSaving(true);
    setError(null);
    try {
      const result = await apiRequest<ConversationTagContract>(API_URL, editingTag ? `${TAGS_API_PATH}/${editingTag.id}` : TAGS_API_PATH, token, {
        method: editingTag ? "PATCH" : "POST",
        body: JSON.stringify({ name, color: selectedColor })
      }, refresh);
      setTags((current) => editingTag ? current.map((tag) => tag.id === result.id ? result : tag) : [...current, result]);
      closeTagModal();
    } catch {
      setError(editingTag ? "Không thể cập nhật thẻ" : "Không thể thêm thẻ");
    } finally {
      setIsSaving(false);
    }
  }

  async function removeTag(tag: ConversationTagContract) {
    if (!window.confirm(`Xóa thẻ "${tag.name}"?`)) return;
    setDeletingId(tag.id);
    setError(null);
    try {
      await apiRequest<void>(API_URL, `${TAGS_API_PATH}/${tag.id}`, token, { method: "DELETE" }, refresh);
      setTags((current) => current.filter((item) => item.id !== tag.id));
    } catch {
      setError("Không thể xóa thẻ");
    } finally {
      setDeletingId(null);
    }
  }

  if (activeTab === "Trợ lý AI") return <main className="min-h-screen bg-gray-50 text-gray-800"><DashboardTopbar onLogoClick={onLogoClick} onNavigate={onNavigate} /><div className="mx-auto flex w-full max-w-6xl gap-6 px-6 py-8 max-[800px]:flex-col max-[800px]:px-4"><aside className="h-fit w-64 shrink-0 rounded-2xl bg-white p-3 shadow-sm max-[800px]:w-full"><h1 className="px-3 pb-3 text-lg font-bold">Cài đặt</h1><nav className="grid gap-1" aria-label="Menu cài đặt">{settingsItems.map((item) => <button className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${activeTab === item ? "bg-sky-50 font-semibold text-sky-700" : "text-gray-600 hover:bg-gray-50"}`} key={item} type="button" onClick={() => setActiveTab(item)}><InboxIcon name={settingsIconByItem[item]} size={17} /> <span>{item}</span>{item === "Trợ lý AI" && <small className="ml-auto rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">Beta</small>}</button>)}</nav></aside><section className="min-w-0 flex-1"><AiAssistantSettings token={token} refresh={refresh} /></section></div></main>;
  if (activeTab === "Hỗ trợ trả lời") return <main className="min-h-screen bg-gray-50 text-gray-800"><DashboardTopbar onLogoClick={onLogoClick} onNavigate={onNavigate} /><div className="mx-auto flex w-full max-w-6xl gap-6 px-6 py-8 max-[800px]:flex-col max-[800px]:px-4"><aside className="h-fit w-64 shrink-0 rounded-2xl bg-white p-3 shadow-sm max-[800px]:w-full"><h1 className="px-3 pb-3 text-lg font-bold">Cài đặt</h1><nav className="grid gap-1" aria-label="Menu cài đặt">{settingsItems.map((item) => <button className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${activeTab === item ? "bg-sky-50 font-semibold text-sky-700" : "text-gray-600 hover:bg-gray-50"}`} key={item} type="button" onClick={() => setActiveTab(item)}><InboxIcon name={settingsIconByItem[item]} size={17} /> <span>{item}</span>{item === "Trợ lý AI" && <small className="ml-auto rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">Beta</small>}</button>)}</nav></aside><section className="min-w-0 flex-1"><h2 className="mb-5 text-2xl font-bold text-gray-900">Hỗ trợ trả lời</h2><QuickReplySettings token={token} refresh={refresh} /></section></div></main>;
  return <main className="min-h-screen bg-gray-50 text-gray-800"><DashboardTopbar onLogoClick={onLogoClick} onNavigate={onNavigate} /><div className="mx-auto flex w-full max-w-6xl gap-6 px-6 py-8 max-[800px]:flex-col max-[800px]:px-4"><aside className="h-fit w-64 shrink-0 rounded-2xl bg-white p-3 shadow-sm max-[800px]:w-full"><h1 className="px-3 pb-3 text-lg font-bold">Cài đặt</h1><nav className="grid gap-1" aria-label="Menu cài đặt">{settingsItems.map((item) => <button className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${activeTab === item ? "bg-sky-50 font-semibold text-sky-700" : "text-gray-600 hover:bg-gray-50"}`} key={item} type="button" onClick={() => setActiveTab(item)}><InboxIcon name={settingsIconByItem[item]} size={17} /> <span>{item}</span>{item === "Trợ lý AI" && <small className="ml-auto rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">Beta</small>}</button>)}</nav></aside><section className="min-w-0 flex-1"><h2 className="mb-5 text-2xl font-bold text-gray-900">{activeTab}</h2><div className="rounded-2xl bg-white p-6 shadow-sm"><div className="flex items-start justify-between gap-4"><p className="max-w-2xl text-sm leading-6 text-gray-500">Thẻ dùng để đánh dấu trạng thái hội thoại trong Livechat (vd "Mua hàng", "Đã gửi") — 1 hội thoại có thể gắn nhiều thẻ cùng lúc.</p><button className="shrink-0 rounded-lg bg-sky-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500" type="button" onClick={openAddTagModal}><span className="mr-1">+</span> Thêm thẻ</button></div>{error && <p className="mt-4 text-sm text-rose-600" role="alert">{error}</p>}{isLoading ? <p className="mt-7 text-sm text-gray-500">Đang tải thẻ...</p> : <div className="mt-7 flex flex-wrap gap-3">{tags.map((tag) => <span className="group inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:scale-[1.02]" style={{ backgroundColor: tag.color }} key={tag.id}>{tag.name}<span className="flex gap-1 opacity-60 transition group-hover:opacity-100"><button type="button" aria-label={`Sửa ${tag.name}`} onClick={() => openEditTagModal(tag)}><InboxIcon name="edit" size={14} /></button><button type="button" aria-label={`Xóa ${tag.name}`} disabled={deletingId === tag.id} onClick={() => void removeTag(tag)}><InboxIcon name="trash" size={14} /></button></span></span>)}</div>}</div></section></div>{isAddTagModalOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4" role="presentation" onMouseDown={closeTagModal}><section className="w-full max-w-md animate-[composer-dialog-in_180ms_ease-out] rounded-2xl bg-white p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="add-tag-title" onMouseDown={(event) => event.stopPropagation()}><div className="flex items-center justify-between"><h3 className="text-lg font-bold" id="add-tag-title">{editingTag ? "Sửa thẻ hội thoại" : "Thêm thẻ hội thoại"}</h3><button className="grid size-8 place-items-center rounded-lg text-gray-500 hover:bg-gray-100" type="button" onClick={closeTagModal} aria-label="Đóng"><InboxIcon name="close" /></button></div><form className="mt-5 grid gap-4" onSubmit={saveTag}><label className="grid gap-1.5 text-sm font-semibold">Tên thẻ<input className="rounded-lg border border-gray-200 px-3 py-2.5 font-normal outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100" placeholder="Vd: Mua hàng" value={tagName} onChange={(event) => setTagName(event.target.value)} /></label><fieldset><legend className="mb-2 text-sm font-semibold">Màu thẻ</legend><div className="flex flex-wrap gap-2">{pickerColors.map((color) => <button className={`size-7 rounded-full ${selectedColor === color ? "ring-2 ring-black ring-offset-2" : ""}`} style={{ backgroundColor: color }} type="button" aria-label={`Chọn màu ${color}`} key={color} onClick={() => setSelectedColor(color)} />)}</div><label className="flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 hover:border-sky-400 hover:text-sky-700"><input className="size-7 cursor-pointer rounded border-0 p-0" type="color" value={selectedColor} onChange={(event) => setSelectedColor(event.target.value)} aria-label="Tùy chỉnh màu" /><span>Tùy chỉnh màu</span></label></fieldset><button className="w-fit rounded-lg bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-700" type="button">Xem trước</button><div className="mt-2 flex justify-end gap-2"><button className="rounded-lg px-4 py-2 text-sm font-semibold text-gray-500 hover:bg-gray-50" type="button" onClick={closeTagModal}>Huỷ</button><button className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60" type="submit" disabled={isSaving}>{isSaving ? "Đang lưu..." : "Lưu"}</button></div></form></section></div>}</main>;
}
