import * as React from "react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { FacebookPageConnectionResponse, FacebookPostResponse } from "@nhuu-chat/contracts";
import { DashboardTopbar } from "../components/dashboard/DashboardTopbar.js";
import { InboxIcon } from "../components/conversations/InboxIcon.js";
import { cancelFacebookPost, connectFacebookPage, createFacebookPost, FacebookPublishingApiError, getFacebookPageConnection, listFacebookPosts, removeFacebookPage, retryFacebookPost, updateFacebookPost } from "../lib/facebook-publishing.api.js";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
type PublishMode = "now" | "draft" | "scheduled";
type EditableMode = "draft" | "scheduled";
type PublishingTab = "compose" | "draft" | "scheduled" | "history";
const sidebarItems: Array<{ id: PublishingTab; label: string; icon: "edit" | "note" | "clock" | "refresh" }> = [
  { id: "compose", label: "Soạn thảo", icon: "edit" },
  { id: "draft", label: "Nháp", icon: "note" },
  { id: "scheduled", label: "Đã lên lịch", icon: "clock" },
  { id: "history", label: "Lịch sử", icon: "refresh" }
];

export interface FacebookPublishingClient {
  getConnection: typeof getFacebookPageConnection;
  connect: typeof connectFacebookPage;
  listPosts: typeof listFacebookPosts;
  remove: typeof removeFacebookPage;
  createPost: typeof createFacebookPost;
  update: typeof updateFacebookPost;
  retry: typeof retryFacebookPost;
  cancel: typeof cancelFacebookPost;
}

const defaultClient: FacebookPublishingClient = { getConnection: getFacebookPageConnection, connect: connectFacebookPage, listPosts: listFacebookPosts, remove: removeFacebookPage, createPost: createFacebookPost, update: updateFacebookPost, retry: retryFacebookPost, cancel: cancelFacebookPost };

export interface FacebookPublishingPageProps {
  onBack?: () => void;
  onLogoClick?: React.ComponentProps<typeof DashboardTopbar>["onLogoClick"];
  onNavigate?: React.ComponentProps<typeof DashboardTopbar>["onNavigate"];
  user?: React.ComponentProps<typeof DashboardTopbar>["user"];
  onLogout?: React.ComponentProps<typeof DashboardTopbar>["onLogout"];
  onProfile?: React.ComponentProps<typeof DashboardTopbar>["onProfile"];
  client?: FacebookPublishingClient;
  initialConnection?: FacebookPageConnectionResponse | null;
  availablePages?: FacebookPageConnectionResponse[];
  initialPosts?: FacebookPostResponse[];
  initialMessage?: string;
  initialMode?: PublishMode;
  initialScheduledAt?: string;
  initialImageUrl?: string | null;
  initialLoading?: boolean;
}

export function validateFacebookPostImage(file: File): string | null {
  return !IMAGE_TYPES.includes(file.type) || file.size > MAX_IMAGE_BYTES ? "Ảnh phải là JPEG, PNG hoặc WebP và không quá 5 MiB." : null;
}

export function connectionAfterFacebookDisconnect(_connection: FacebookPageConnectionResponse | null): null {
  return null;
}

function errorMessage(error: unknown): string {
  return error instanceof FacebookPublishingApiError ? error.message : "Không thể kết nối máy chủ. Vui lòng thử lại.";
}

function displayDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(value));
}

function dateTimeLocal(value: string | null | undefined): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("sv-SE", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(value)).replace(" ", "T");
}

function statusLabel(status: FacebookPostResponse["status"]): string {
  return { draft: "Bản nháp", scheduled: "Đã hẹn", publishing: "Đang đăng", published: "Đã đăng", failed: "Thất bại" }[status];
}

function facebookPostUrl(post: FacebookPostResponse): string | null {
  return post.publishedPostId ? "https://www.facebook.com/" + encodeURIComponent(post.publishedPostId) : null;
}

export function FacebookPublishingPage({ onBack, onLogoClick, onNavigate, user, onLogout, onProfile, client = defaultClient, initialConnection = null, availablePages = [], initialPosts = [], initialMessage = "", initialMode = "now", initialScheduledAt = "", initialImageUrl = null, initialLoading = true }: FacebookPublishingPageProps) {
  const [connection, setConnection] = useState<FacebookPageConnectionResponse | null>(initialConnection);
  const [selectedPageId, setSelectedPageId] = useState(initialConnection?.pageId ?? availablePages[0]?.pageId ?? "");
  const [connectionLoading, setConnectionLoading] = useState(initialLoading);
  const [pageId, setPageId] = useState("");
  const [pageAccessToken, setPageAccessToken] = useState("");
  const [message, setMessage] = useState(initialMessage);
  const [mode, setMode] = useState<PublishMode>(initialMode);
  const [scheduledAt, setScheduledAt] = useState(initialScheduledAt);
  const [image, setImage] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(initialImageUrl);
  const [posts, setPosts] = useState<FacebookPostResponse[]>(initialPosts);
  const [activeTab, setActiveTab] = useState<PublishingTab>("compose");
  const [editingPost, setEditingPost] = useState<FacebookPostResponse | null>(null);
  const [editMessage, setEditMessage] = useState("");
  const [editMode, setEditMode] = useState<EditableMode>("draft");
  const [editScheduledAt, setEditScheduledAt] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadPosts = useCallback(async () => {
    try { setPosts(await client.listPosts()); } catch (requestError) { setActionError(errorMessage(requestError)); }
  }, [client]);

  useEffect(() => {
    if (!initialLoading) return;
    let cancelled = false;
    void client.getConnection().then((result) => { if (!cancelled) { setConnection(result); void loadPosts(); } }).catch((requestError) => {
      if (!cancelled && !(requestError instanceof FacebookPublishingApiError && requestError.code === "FACEBOOK_PAGE_NOT_CONNECTED")) setError(errorMessage(requestError));
    }).finally(() => { if (!cancelled) setConnectionLoading(false); });
    return () => { cancelled = true; };
  }, [client, initialLoading, loadPosts]);

  useEffect(() => {
    if (!connection) return;
    const timer = window.setInterval(() => { void loadPosts(); }, 5000);
    return () => window.clearInterval(timer);
  }, [connection, loadPosts]);

  useEffect(() => () => { if (imageUrl) URL.revokeObjectURL(imageUrl); }, [imageUrl]);

  const previewText = useMemo(() => message.trim() || "Nội dung bài viết sẽ hiển thị ở đây.", [message]);
  const draftPosts = posts.filter((post) => post.status === "draft");
  const scheduledPosts = posts.filter((post) => post.status === "scheduled");
  const historyPosts = posts.filter((post) => post.status === "published" || post.status === "failed");
  const pageOptions = useMemo(() => availablePages.length > 0 ? availablePages : connection ? [connection] : [], [availablePages, connection]);
  const selectedPage = pageOptions.find((page) => page.pageId === selectedPageId) ?? pageOptions[0] ?? connection;

  useEffect(() => {
    if (selectedPage && selectedPage.pageId !== selectedPageId) setSelectedPageId(selectedPage.pageId);
  }, [selectedPage, selectedPageId]);

  function selectImage(file: File | undefined) {
    if (!file) return;
    const validationError = validateFacebookPostImage(file);
    if (validationError) { setError(validationError); return; }
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImage(file); setImageUrl(URL.createObjectURL(file)); setError(null);
  }

  async function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(null); setBusy(true);
    try { setConnection(await client.connect({ pageId: pageId.trim(), pageAccessToken })); setPageAccessToken(""); await loadPosts(); }
    catch (requestError) { setError(errorMessage(requestError)); } finally { setBusy(false); }
  }

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!message.trim()) { setError("Vui lòng nhập nội dung bài viết."); return; }
    if (mode === "scheduled" && !scheduledAt) { setError("Vui lòng chọn thời gian hẹn đăng."); return; }
    setError(null); setBusy(true);
    try { await client.createPost({ message: message.trim(), mode, ...(mode === "scheduled" ? { scheduledAt } : {}), image }); setMessage(""); setImage(null); if (imageUrl) URL.revokeObjectURL(imageUrl); setImageUrl(null); setScheduledAt(""); await loadPosts(); }
    catch (requestError) { setError(errorMessage(requestError)); } finally { setBusy(false); }
  }

  async function runAction(action: () => Promise<unknown>, onSuccess?: () => void) {
    setActionError(null); setBusy(true);
    try { await action(); onSuccess?.(); await loadPosts(); } catch (requestError) { setActionError(errorMessage(requestError)); } finally { setBusy(false); }
  }

  function openEditor(post: FacebookPostResponse) {
    setEditingPost(post); setEditMessage(post.message); setEditMode(post.status === "scheduled" ? "scheduled" : "draft"); setEditScheduledAt(dateTimeLocal(post.scheduledAt)); setActionError(null);
  }

  function closeEditor() {
    if (editBusy) return;
    setEditingPost(null); setEditMessage(""); setEditScheduledAt("");
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingPost || !editMessage.trim()) { setActionError("Vui lòng nhập nội dung bài viết."); return; }
    if (editMode === "scheduled" && !editScheduledAt) { setActionError("Vui lòng chọn thời gian hẹn đăng."); return; }
    setActionError(null); setEditBusy(true);
    try {
      await client.update(editingPost.id, { message: editMessage.trim(), mode: editMode, scheduledAt: editMode === "scheduled" ? editScheduledAt : null });
      setEditingPost(null); setEditMessage(""); setEditScheduledAt(""); await loadPosts();
    } catch (requestError) { setActionError(errorMessage(requestError)); } finally { setEditBusy(false); }
  }

  function removePost(post: FacebookPostResponse) {
    if (window.confirm("Xóa bài viết này khỏi hệ thống?")) void runAction(() => client.cancel(post.id));
  }

  function renderPostCard(post: FacebookPostResponse) {
    const externalUrl = facebookPostUrl(post);
    const editable = post.status === "draft" || post.status === "scheduled";
    const statusClass = post.status === "failed" ? "bg-rose-50 text-rose-700" : post.status === "published" ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-700";
    return <article className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm" key={post.id}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="line-clamp-3 whitespace-pre-wrap text-sm font-medium text-gray-800">{post.message}</p><p className="mt-2 text-xs text-gray-500">{post.scheduledAt ? "Dự kiến đăng: " + displayDate(post.scheduledAt) : "Tạo lúc: " + displayDate(post.createdAt)} · Asia/Ho_Chi_Minh</p></div><span className={"shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold " + statusClass}>{statusLabel(post.status)}</span></div>{post.status === "failed" && <p className="mt-3 rounded-lg bg-rose-50 p-3 text-xs text-rose-700">Bài viết chưa đăng được. {post.lastErrorCode ? "Mã lỗi: " + post.lastErrorCode : post.lastErrorMessage ?? "Bạn có thể thử lại."}</p>}<div className="mt-4 flex flex-wrap gap-2">{editable && <button className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50" type="button" disabled={busy} onClick={() => openEditor(post)}><InboxIcon name="edit" size={14} /> Sửa</button>}{post.status === "failed" && <button className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50" type="button" disabled={busy} onClick={() => void runAction(() => client.retry(post.id, "now"))}>Thử lại</button>}{post.status === "published" && externalUrl && <a className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-50" href={externalUrl} target="_blank" rel="noopener noreferrer"><InboxIcon name="monitor" size={14} /> Xem trên FB</a>}{(editable || post.status === "published" || post.status === "failed") && <button className="inline-flex items-center gap-1.5 rounded-lg border border-rose-100 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50" type="button" disabled={busy} onClick={() => removePost(post)}><InboxIcon name="trash" size={14} /> {post.status === "scheduled" ? "Hủy lịch" : "Xóa"}</button>}</div></article>;
  }

  function renderList(items: FacebookPostResponse[], emptyMessage: string) {
    return <div className="grid gap-3">{actionError && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700" role="alert">{actionError}</p>}{items.map(renderPostCard)}{items.length === 0 && <p className="rounded-xl bg-white py-12 text-center text-sm text-gray-500 shadow-sm">{emptyMessage}</p>}</div>;
  }

  function renderComposer() {
    return <><section className="mb-6 flex items-center justify-between rounded-xl border border-gray-200 bg-white p-5"><div className="flex flex-col gap-1.5"><div className="flex items-center gap-3"><select className="border border-gray-300 rounded-lg px-3 py-2 text-gray-900 font-semibold cursor-pointer min-w-[220px] focus:ring-2 focus:ring-blue-500 outline-none" aria-label="Chọn Facebook Page" value={selectedPage?.pageId ?? ""} onChange={(event) => setSelectedPageId(event.target.value)}>{pageOptions.map((page) => <option value={page.pageId} key={page.pageId}>{page.pageName ?? `Page ${page.pageId}`}</option>)}</select><span className="px-3 py-1 bg-teal-50 text-teal-700 text-sm font-medium rounded-full">Đã kết nối</span></div><p className="text-sm text-gray-500">Page ID: {selectedPage?.pageId ?? "—"}</p></div><button className="text-red-600 font-medium hover:bg-red-50 px-4 py-2 rounded-lg transition-colors" type="button" onClick={() => { if (window.confirm("Gỡ kết nối Facebook Page?")) void runAction(() => client.remove(), () => setConnection(connectionAfterFacebookDisconnect(connection))); }}>Gỡ kết nối</button></section><div className="grid gap-6 xl:grid-cols-[1.1fr_.9fr]"><section className="rounded-2xl bg-white p-5 shadow-sm sm:p-6"><h2 className="text-lg font-semibold text-gray-900">Soạn bài</h2><form className="mt-4 grid gap-4" onSubmit={publish}><label className="grid gap-1.5 text-sm font-semibold text-gray-700">Nội dung<textarea className="min-h-40 rounded-xl border border-gray-200 p-3 font-normal outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100" maxLength={63206} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Bạn muốn chia sẻ điều gì?" /></label><label className="grid gap-1.5 text-sm font-semibold text-gray-700">Ảnh (tối đa 1 ảnh, 5 MiB)<input className="rounded-xl border border-gray-200 p-2 text-sm font-normal" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => selectImage(event.target.files?.[0])} /></label><fieldset className="grid gap-2"><legend className="text-sm font-semibold text-gray-700">Chế độ đăng</legend><label className="flex items-center gap-2 text-sm text-gray-600"><input type="radio" name="publish-mode" value="now" checked={mode === "now"} onChange={() => setMode("now")} />Đăng ngay</label><label className="flex items-center gap-2 text-sm text-gray-600"><input type="radio" name="publish-mode" value="draft" checked={mode === "draft"} onChange={() => setMode("draft")} />Lưu bản nháp</label><label className="flex items-center gap-2 text-sm text-gray-600"><input type="radio" name="publish-mode" value="scheduled" checked={mode === "scheduled"} onChange={() => setMode("scheduled")} />Hẹn đăng</label></fieldset>{mode === "scheduled" && <label className="grid gap-1.5 text-sm font-semibold text-gray-700">Thời gian (Asia/Ho_Chi_Minh)<input className="rounded-xl border border-gray-200 px-3 py-2.5 font-normal" type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} /></label>}{error && <p className="rounded-lg bg-rose-50 p-3 text-sm font-normal text-rose-700" role="alert">{error}</p>}<button className="w-fit rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60" type="submit" disabled={busy}>{busy ? "Đang xử lý..." : mode === "now" ? "Đăng ngay" : mode === "draft" ? "Lưu bản nháp" : "Hẹn đăng"}</button></form></section><section className="rounded-2xl bg-white p-5 shadow-sm sm:p-6"><h2 className="text-lg font-semibold text-gray-900">Xem trước</h2><article className="mt-4 overflow-hidden rounded-xl border border-gray-200"><div className="p-4"><p className="whitespace-pre-wrap text-sm text-gray-700">{previewText}</p></div>{imageUrl && <img className="max-h-80 w-full object-cover" src={imageUrl} alt="Xem trước ảnh bài viết" />}</article></section></div></>;
  }

  if (connectionLoading) return <main className="grid min-h-screen place-items-center bg-gray-50 p-6" role="status">Đang tải kết nối Facebook...</main>;
  const isConnected = connection?.status === "connected";
  const activeItems = activeTab === "draft" ? draftPosts : activeTab === "scheduled" ? scheduledPosts : historyPosts;
  return <main className="min-h-screen bg-gray-50 text-gray-800" aria-label="Quản lý bài viết Facebook"><DashboardTopbar onLogoClick={onLogoClick} onNavigate={onNavigate} user={user} onLogout={onLogout} onProfile={onProfile} /><div className="px-4 py-6 sm:px-6 lg:px-8"><div className="mx-auto flex max-w-7xl items-start gap-6 max-[900px]:flex-col"><aside className="sticky top-24 self-start h-[calc(100vh-6rem)] overflow-y-auto w-full shrink-0 rounded-2xl bg-white p-3 shadow-sm max-[900px]:static max-[900px]:h-auto max-[900px]:overflow-visible lg:w-64" aria-label="Menu đăng bài Facebook"><div className="px-3 pb-3">
    </div><nav className="grid gap-1" aria-label="Các mục đăng bài">{sidebarItems.map((item) => <button className={"flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition " + (activeTab === item.id ? "bg-gray-200 font-semibold text-gray-900 shadow-sm" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900")} aria-current={activeTab === item.id ? "page" : undefined} key={item.id} type="button" onClick={() => setActiveTab(item.id)}><InboxIcon name={item.icon} size={17} /><span>{item.label}</span>{item.id === "draft" && draftPosts.length > 0 && <small className="ml-auto rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500">{draftPosts.length}</small>}</button>)}</nav></aside><section className="min-w-0 flex-1">{error && !isConnected && <p className="mb-5 rounded-lg bg-rose-50 p-3 text-sm text-rose-700" role="alert">{error}</p>}{!isConnected ? <section className="rounded-2xl bg-white p-6 shadow-sm"><h2 className="text-lg font-semibold text-gray-900">Kết nối Facebook Page</h2><p className="mt-1 text-sm text-gray-500">Token chỉ được gửi tới máy chủ qua kết nối bảo mật và không được lưu trong trình duyệt.</p><form className="mt-5 grid max-w-xl gap-4" onSubmit={connect}><label className="grid gap-1.5 text-sm font-semibold text-gray-700">Page ID<input className="rounded-xl border border-gray-200 px-3 py-2.5 font-normal" value={pageId} onChange={(event) => setPageId(event.target.value)} required /></label><label className="grid gap-1.5 text-sm font-semibold text-gray-700">Page access token<input className="rounded-xl border border-gray-200 px-3 py-2.5 font-normal" type="password" value={pageAccessToken} onChange={(event) => setPageAccessToken(event.target.value)} required autoComplete="off" /></label><button className="w-fit rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60" type="submit" disabled={busy}>{busy ? "Đang kết nối..." : "Kết nối Page"}</button></form></section> : activeTab === "compose" ? renderComposer() : <section><div className="mb-4 flex items-center justify-between"><div><h2 className="text-xl font-bold text-gray-900">{activeTab === "draft" ? "Nháp" : activeTab === "scheduled" ? "Đã lên lịch" : "Lịch sử"}</h2><p className="mt-1 text-sm text-gray-500">{activeTab === "draft" ? "Các bài viết đang chờ hoàn thiện." : activeTab === "scheduled" ? "Các bài viết đã đặt lịch đăng." : "Theo dõi các bài viết đã đăng hoặc thất bại."}</p></div><button className="rounded-lg px-3 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-50" type="button" onClick={() => void loadPosts()}>Làm mới</button></div>{renderList(activeItems, activeTab === "draft" ? "Chưa có bài viết nháp." : activeTab === "scheduled" ? "Chưa có bài viết nào được lên lịch." : "Chưa có lịch sử đăng bài.")}</section>}</section></div></div>{editingPost && <EditPostModal busy={editBusy} message={editMessage} mode={editMode} scheduledAt={editScheduledAt} onClose={closeEditor} onMessageChange={setEditMessage} onModeChange={setEditMode} onScheduledAtChange={setEditScheduledAt} onSubmit={saveEdit} />}</main>;
}

function EditPostModal({ busy, message, mode, scheduledAt, onClose, onMessageChange, onModeChange, onScheduledAtChange, onSubmit }: { busy: boolean; message: string; mode: EditableMode; scheduledAt: string; onClose: () => void; onMessageChange: (value: string) => void; onModeChange: (value: EditableMode) => void; onScheduledAtChange: (value: string) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <div className="fixed inset-0 z-50 grid place-items-center bg-gray-900/40 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="edit-facebook-post-title"><div className="flex items-center justify-between gap-4"><h2 id="edit-facebook-post-title" className="text-lg font-bold text-gray-900">Sửa bài viết</h2><button className="grid size-8 place-items-center rounded-lg text-gray-500 hover:bg-gray-100" type="button" aria-label="Đóng" onClick={onClose}><InboxIcon name="close" size={17} /></button></div><form className="mt-5 grid gap-4" onSubmit={onSubmit}><label className="grid gap-1.5 text-sm font-semibold text-gray-700">Nội dung<textarea className="min-h-32 rounded-xl border border-gray-200 p-3 font-normal outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100" value={message} onChange={(event) => onMessageChange(event.target.value)} required /></label><fieldset className="grid gap-2"><legend className="text-sm font-semibold text-gray-700">Trạng thái bài viết</legend><label className="flex items-center gap-2 text-sm text-gray-600"><input type="radio" checked={mode === "draft"} onChange={() => onModeChange("draft")} />Lưu bản nháp</label><label className="flex items-center gap-2 text-sm text-gray-600"><input type="radio" checked={mode === "scheduled"} onChange={() => onModeChange("scheduled")} />Đã lên lịch</label></fieldset>{mode === "scheduled" && <label className="grid gap-1.5 text-sm font-semibold text-gray-700">Thời gian dự kiến đăng<input className="rounded-xl border border-gray-200 px-3 py-2.5 font-normal" type="datetime-local" value={scheduledAt} onChange={(event) => onScheduledAtChange(event.target.value)} required /></label>}<div className="flex justify-end gap-2"><button className="rounded-xl px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50" type="button" onClick={onClose}>Hủy</button><button className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60" type="submit" disabled={busy}>{busy ? "Đang lưu..." : "Lưu thay đổi"}</button></div></form></section></div>;
}
