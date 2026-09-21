import * as React from "react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { FacebookPageConnectionResponse, FacebookPostResponse } from "@nhuu-chat/contracts";
import { cancelFacebookPost, connectFacebookPage, createFacebookPost, FacebookPublishingApiError, getFacebookPageConnection, listFacebookPosts, removeFacebookPage, retryFacebookPost } from "../lib/facebook-publishing.api.js";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
type PublishMode = "now" | "draft" | "scheduled";

export interface FacebookPublishingPageViewProps {
  connection: FacebookPageConnectionResponse | null;
  posts: FacebookPostResponse[];
  message: string;
  mode: PublishMode;
  scheduledAt: string;
  imageUrl: string | null;
  busy: boolean;
  error: string | null;
  actionError: string | null;
  pageId?: string;
  pageAccessToken?: string;
  onRetry?: (id: string) => void;
  onCancel?: (id: string) => void;
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

function statusLabel(status: FacebookPostResponse["status"]): string {
  return { draft: "Bản nháp", scheduled: "Đã hẹn", publishing: "Đang đăng", published: "Đã đăng", failed: "Thất bại" }[status];
}

export function FacebookPublishingPage({ onBack }: { onBack?: () => void }) {
  const [connection, setConnection] = useState<FacebookPageConnectionResponse | null>(null);
  const [connectionLoading, setConnectionLoading] = useState(true);
  const [pageId, setPageId] = useState("");
  const [pageAccessToken, setPageAccessToken] = useState("");
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<PublishMode>("now");
  const [scheduledAt, setScheduledAt] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [posts, setPosts] = useState<FacebookPostResponse[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadPosts = useCallback(async () => {
    try { setPosts(await listFacebookPosts()); } catch (requestError) { setActionError(errorMessage(requestError)); }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getFacebookPageConnection().then((result) => { if (!cancelled) { setConnection(result); void loadPosts(); } }).catch((requestError) => {
      if (!cancelled && !(requestError instanceof FacebookPublishingApiError && requestError.code === "FACEBOOK_PAGE_NOT_CONNECTED")) setError(errorMessage(requestError));
    }).finally(() => { if (!cancelled) setConnectionLoading(false); });
    return () => { cancelled = true; };
  }, [loadPosts]);

  useEffect(() => {
    if (!connection) return;
    const timer = window.setInterval(() => { void loadPosts(); }, 5000);
    return () => window.clearInterval(timer);
  }, [connection, loadPosts]);

  useEffect(() => () => { if (imageUrl) URL.revokeObjectURL(imageUrl); }, [imageUrl]);

  const previewText = useMemo(() => message.trim() || "Nội dung bài viết sẽ hiển thị ở đây.", [message]);

  function selectImage(file: File | undefined) {
    if (!file) return;
    const validationError = validateFacebookPostImage(file);
    if (validationError) { setError(validationError); return; }
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImage(file);
    setImageUrl(URL.createObjectURL(file));
    setError(null);
  }

  async function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null); setBusy(true);
    try { setConnection(await connectFacebookPage({ pageId: pageId.trim(), pageAccessToken })); setPageAccessToken(""); await loadPosts(); }
    catch (requestError) { setError(errorMessage(requestError)); }
    finally { setBusy(false); }
  }

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!message.trim()) { setError("Vui lòng nhập nội dung bài viết."); return; }
    if (mode === "scheduled" && !scheduledAt) { setError("Vui lòng chọn thời gian hẹn đăng."); return; }
    setError(null); setBusy(true);
    try { await createFacebookPost({ message: message.trim(), mode, ...(mode === "scheduled" ? { scheduledAt } : {}), image }); setMessage(""); setImage(null); if (imageUrl) URL.revokeObjectURL(imageUrl); setImageUrl(null); setScheduledAt(""); await loadPosts(); }
    catch (requestError) { setError(errorMessage(requestError)); }
    finally { setBusy(false); }
  }

  async function runAction(action: () => Promise<unknown>, onSuccess?: () => void) {
    setActionError(null); setBusy(true);
    try { await action(); onSuccess?.(); await loadPosts(); } catch (requestError) { setActionError(errorMessage(requestError)); } finally { setBusy(false); }
  }

  if (connectionLoading) return <main className="grid min-h-screen place-items-center bg-slate-100 p-6" role="status">Đang tải kết nối Facebook...</main>;

  const isConnected = connection?.status === "connected";
  return <main className="min-h-screen bg-slate-100 px-4 py-6 text-slate-800 sm:px-8" aria-labelledby="facebook-publishing-title">
    <div className="mx-auto grid max-w-6xl gap-6">
      <header className="flex items-center justify-between gap-4"><div><button className="text-sm text-sky-700" type="button" onClick={onBack}>← Dashboard</button><h1 id="facebook-publishing-title" className="mt-2 text-2xl font-bold text-slate-900">Đăng bài Facebook Page</h1><p className="mt-1 text-sm text-slate-500">Quản lý bài viết bằng múi giờ Asia/Ho_Chi_Minh.</p></div>{isConnected && <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-700">Đã kết nối</span>}</header>
      {error && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700" role="alert">{error}</p>}
      {!isConnected ? <section className="rounded-2xl bg-white p-6 shadow-sm"><h2 className="text-lg font-semibold text-slate-900">Kết nối Facebook Page</h2><p className="mt-1 text-sm text-slate-500">Token chỉ được gửi tới máy chủ qua kết nối bảo mật và không được lưu trong trình duyệt.</p><form className="mt-5 grid max-w-xl gap-4" onSubmit={connect}><label className="grid gap-1 text-sm font-medium">Page ID<input className="rounded-lg border border-slate-300 px-3 py-2" value={pageId} onChange={(event) => setPageId(event.target.value)} required /></label><label className="grid gap-1 text-sm font-medium">Page access token<input className="rounded-lg border border-slate-300 px-3 py-2" type="password" value={pageAccessToken} onChange={(event) => setPageAccessToken(event.target.value)} required autoComplete="off" /></label><button className="w-fit rounded-lg bg-sky-600 px-4 py-2 font-semibold text-white disabled:opacity-60" type="submit" disabled={busy}>{busy ? "Đang kết nối..." : "Kết nối Page"}</button></form></section> : <>
        <section className="rounded-2xl bg-white p-6 shadow-sm"><div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold text-slate-900">{connection.pageName ?? `Page ${connection.pageId}`}</h2><p className="mt-1 text-sm text-slate-500">Page ID: {connection.pageId}</p></div><button className="text-sm text-rose-600" type="button" onClick={() => { if (window.confirm("Gỡ kết nối Facebook Page?")) void runAction(removeFacebookPage, () => setConnection(connectionAfterFacebookDisconnect(connection))); }}>Gỡ kết nối</button></div></section>
        <div className="grid gap-6 lg:grid-cols-[1.1fr_.9fr]"><section className="rounded-2xl bg-white p-6 shadow-sm"><h2 className="text-lg font-semibold text-slate-900">Soạn bài</h2><form className="mt-4 grid gap-4" onSubmit={publish}><label className="grid gap-1 text-sm font-medium">Nội dung<textarea className="min-h-36 rounded-lg border border-slate-300 p-3" maxLength={63206} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Bạn muốn chia sẻ điều gì?" /></label><label className="grid gap-1 text-sm font-medium">Ảnh (tối đa 1 ảnh, 5 MiB)<input className="rounded-lg border border-slate-300 p-2 text-sm" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => selectImage(event.target.files?.[0])} /></label><fieldset className="grid gap-2"><legend className="text-sm font-medium">Chế độ đăng</legend><label className="flex gap-2 text-sm"><input type="radio" name="publish-mode" value="now" checked={mode === "now"} onChange={() => setMode("now")} />Đăng ngay</label><label className="flex gap-2 text-sm"><input type="radio" name="publish-mode" value="draft" checked={mode === "draft"} onChange={() => setMode("draft")} />Lưu bản nháp</label><label className="flex gap-2 text-sm"><input type="radio" name="publish-mode" value="scheduled" checked={mode === "scheduled"} onChange={() => setMode("scheduled")} />Hẹn đăng</label></fieldset>{mode === "scheduled" && <label className="grid gap-1 text-sm font-medium">Thời gian ({"Asia/Ho_Chi_Minh"})<input className="rounded-lg border border-slate-300 px-3 py-2" type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} /></label>}<button className="w-fit rounded-lg bg-sky-600 px-4 py-2 font-semibold text-white disabled:opacity-60" type="submit" disabled={busy}>{busy ? "Đang xử lý..." : mode === "now" ? "Đăng ngay" : mode === "draft" ? "Lưu bản nháp" : "Hẹn đăng"}</button></form></section><section className="rounded-2xl bg-white p-6 shadow-sm"><h2 className="text-lg font-semibold text-slate-900">Xem trước</h2><article className="mt-4 overflow-hidden rounded-xl border border-slate-200"><div className="p-4"><p className="whitespace-pre-wrap text-sm">{previewText}</p></div>{imageUrl && <img className="max-h-80 w-full object-cover" src={imageUrl} alt="Xem trước ảnh bài viết" />}</article></section></div>
        <section className="rounded-2xl bg-white p-6 shadow-sm"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold text-slate-900">Bài viết</h2><button className="text-sm text-sky-700" type="button" onClick={() => void loadPosts()}>Làm mới</button></div>{actionError && <p className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700" role="alert">{actionError}</p>}<div className="mt-4 grid gap-3">{posts.map((post) => <article className="rounded-xl border border-slate-200 p-4" key={post.id}><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{post.message}</span><span className="rounded-full bg-slate-100 px-2 py-1 text-xs">{statusLabel(post.status)}</span></div><p className="mt-2 text-xs text-slate-500">{post.scheduledAt ? `Hẹn: ${displayDate(post.scheduledAt)}` : `Cập nhật: ${displayDate(post.updatedAt)}`} · Asia/Ho_Chi_Minh</p>{post.status === "failed" && <p className="mt-2 text-sm text-rose-600">Bài viết chưa đăng được. {post.lastErrorCode ? `Mã lỗi: ${post.lastErrorCode}` : "Bạn có thể thử lại."}</p>}<div className="mt-3 flex gap-2">{post.status === "failed" && <button className="rounded border px-3 py-1 text-sm" type="button" disabled={busy} onClick={() => void runAction(() => retryFacebookPost(post.id, "now"))}>Thử lại</button>}{post.status === "scheduled" && <button className="rounded border px-3 py-1 text-sm" type="button" disabled={busy} onClick={() => void runAction(() => cancelFacebookPost(post.id))}>Hủy lịch</button>}</div></article>)}{posts.length === 0 && <p className="py-8 text-center text-sm text-slate-500">Chưa có bài viết.</p>}</div></section>
      </>}
    </div>
  </main>;
}

export function FacebookPublishingPageView({ connection, posts, message, mode, scheduledAt, imageUrl, busy, error, actionError, onRetry, onCancel }: FacebookPublishingPageViewProps) {
  return <main aria-labelledby="facebook-publishing-view-title">
    <h1 id="facebook-publishing-view-title">Đăng bài Facebook Page</h1>
    {error && <p role="alert">{error}</p>}
    {!connection ? <section aria-label="Kết nối Facebook Page"><h2>Kết nối Facebook Page</h2><label>Page ID<input name="page-id" /></label><label>Page access token<input type="password" name="page-access-token" autoComplete="off" /></label><button type="button">Kết nối Page</button></section> : <>
      <section aria-label="Soạn bài"><h2>Soạn bài</h2><textarea aria-label="Nội dung" value={message} readOnly /><input type="file" accept="image/jpeg,image/png,image/webp" /><fieldset><legend>Chế độ đăng</legend><label><input type="radio" name="publish-mode" value="now" checked={mode === "now"} readOnly />Đăng ngay</label><label><input type="radio" name="publish-mode" value="draft" checked={mode === "draft"} readOnly />Lưu bản nháp</label><label><input type="radio" name="publish-mode" value="scheduled" checked={mode === "scheduled"} readOnly />Hẹn đăng</label>{mode === "scheduled" && <output>{scheduledAt} · Asia/Ho_Chi_Minh</output>}</fieldset></section>
      <section aria-label="Xem trước"><h2>Xem trước</h2><p>{message || "Nội dung bài viết sẽ hiển thị ở đây."}</p>{imageUrl && <img src={imageUrl} alt="Xem trước ảnh bài viết" />}</section>
      <section aria-label="Bài viết"><h2>Bài viết</h2>{actionError && <p role="alert">{actionError}</p>}{posts.map((post) => <article key={post.id}><p>{post.message}</p>{post.status === "failed" && <><p>{post.lastErrorCode}</p><button type="button" disabled={busy} onClick={() => onRetry?.(post.id)}>Thử lại</button></>}{post.status === "scheduled" && <button type="button" disabled={busy} onClick={() => onCancel?.(post.id)}>Hủy lịch</button>}</article>)}</section>
    </>}
  </main>;
}
