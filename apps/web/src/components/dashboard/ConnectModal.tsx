import * as React from "react";
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

import { apiRequest } from "../../lib/api.js";
import { FacebookPublishingApiError, listFacebookOAuthPages, selectFacebookOAuthPage, startFacebookOAuth, type FacebookOAuthPage } from "../../lib/facebook-publishing.api.js";
import { connectionProviders, initialConnectionProvider, type ConnectionProviderId } from "../../state/dashboard-ui.js";
import { PlatformIcon } from "./PlatformIcon.js";
import { connectModalCloseDurationMs } from "../../state/modal-ui.js";

interface QrStatus {
  id: string;
  status: "waiting" | "password_required" | "connected" | "failed";
  qrUrl: string | null;
  expiresAt: string | null;
  error: string | null;
  passwordHint: string | null;
}

interface ZaloQrStatus {
  id: string;
  status: "disconnected" | "waiting_qr" | "connected" | "expired" | "error";
  qrData?: string;
  expiresAt?: string;
  displayName?: string;
  username?: string;
  zaloUserId?: string;
  errorCode?: string;
}

export function ConnectModal({ token, refresh, onClose, onConnected, initialProvider }: { token: string; refresh?: () => Promise<string | null>; onClose: () => void; onConnected: () => void; initialProvider?: ConnectionProviderId }) {
  const [selected, setSelected] = useState<ConnectionProviderId>(initialProvider ?? initialConnectionProvider);
  const [qr, setQr] = useState<QrStatus | null>(null);
  const [zaloQr, setZaloQr] = useState<ZaloQrStatus | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [zaloImage, setZaloImage] = useState<string | null>(null);
  const [oauthPages, setOauthPages] = useState<FacebookOAuthPage[]>([]);
  const [oauthSelection, setOauthSelection] = useState<string | null>(null);
  const [oauthSelectedPageId, setOauthSelectedPageId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [closing, setClosing] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  function requestClose() {
    if (closing) return;
    setClosing(true);
    window.setTimeout(onClose, connectModalCloseDurationMs);
  }

  useEffect(() => {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") requestClose();
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])');
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!dialogRef.current?.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      openerRef.current?.focus();
    };
  }, []);

  useEffect(() => {
    if (!qr || (qr.status !== "waiting" && qr.status !== "password_required")) return;
    const timer = window.setInterval(() => {
      void apiRequest<QrStatus>("", `/api/v1/channels/telegram-personal/qr/${qr.id}`, token, {}, refresh)
        .then((next) => {
          setQr(next);
          if (next.status === "connected") onConnected();
        })
        .catch(() => undefined);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [onConnected, qr?.id, qr?.status, refresh, token]);

  useEffect(() => {
    if (!zaloQr || zaloQr.status !== "waiting_qr") return;
    const timer = window.setInterval(() => {
      void apiRequest<ZaloQrStatus>("", `/api/v1/channels/zalo-personal/qr/${zaloQr.id}`, token, {}, refresh)
        .then((next) => {
          setZaloQr(next);
          if (next.status === "connected") onConnected();
        })
        .catch(() => undefined);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [onConnected, refresh, token, zaloQr?.id, zaloQr?.status]);

  useEffect(() => {
    if (selected !== "facebook") return;
    const params = new URLSearchParams(window.location.search);
    const selection = params.get("facebook_oauth") === "select" ? params.get("selection") : null;
    const oauthError = params.get("facebook_oauth") === "error" ? params.get("code") : null;
    if (selection) {
      setOauthSelection(selection);
      setLoading(true);
      void listFacebookOAuthPages(selection)
        .then(setOauthPages)
        .catch((requestError) => setError(requestError instanceof FacebookPublishingApiError ? requestError.message : "Không thể tải danh sách Facebook Page"))
        .finally(() => setLoading(false));
      window.history.replaceState({}, "", "/dashboard");
    } else if (oauthError) {
      setError("Không thể đăng nhập Facebook. Hãy thử lại.");
      window.history.replaceState({}, "", "/dashboard");
    }
  }, [selected]);

  useEffect(() => {
    if (!qr?.qrUrl) { setImage(null); return; }
    void QRCode.toDataURL(qr.qrUrl, { width: 260, margin: 2 }).then(setImage).catch(() => setError("Không thể tạo mã QR"));
  }, [qr?.qrUrl]);

  useEffect(() => {
    if (!zaloQr?.qrData) { setZaloImage(null); return; }
    if (zaloQr.qrData.startsWith("data:image/")) {
      setZaloImage(zaloQr.qrData);
      return;
    }
    // zca-js trả PNG base64 thô; bổ sung data URI để trình duyệt hiển thị đúng ảnh QR.
    setZaloImage(`data:image/png;base64,${zaloQr.qrData}`);
  }, [zaloQr?.qrData]);

  async function startTelegram() {
    setError(null);
    setLoading(true);
    try {
      setQr(await apiRequest<QrStatus>("", "/api/v1/channels/telegram-personal/qr", token, { method: "POST" }, refresh));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Không thể tạo mã QR");
    } finally {
      setLoading(false);
    }
  }

  // Tạo phiên QR Zalo theo owner đã xác thực và giữ QR trong bộ nhớ giao diện.
  async function startZalo() {
    setError(null);
    setLoading(true);
    try {
      setZaloQr(await apiRequest<ZaloQrStatus>("", "/api/v1/channels/zalo-personal/qr", token, { method: "POST" }, refresh));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Không thể tạo mã QR Zalo");
    } finally {
      setLoading(false);
    }
  }

  async function startFacebook() {
    setError(null);
    setLoading(true);
    try {
      const { authorizationUrl } = await startFacebookOAuth();
      window.location.assign(authorizationUrl);
    } catch (requestError) {
      setError(requestError instanceof FacebookPublishingApiError ? requestError.message : "Không thể bắt đầu đăng nhập Facebook");
      setLoading(false);
    }
  }

  async function selectFacebookPage() {
    if (!oauthSelection || !oauthSelectedPageId) return;
    setError(null);
    setLoading(true);
    try {
      await selectFacebookOAuthPage(oauthSelection, oauthSelectedPageId);
      onConnected();
      setOauthSelection(null);
    } catch (requestError) {
      setError(requestError instanceof FacebookPublishingApiError ? requestError.message : "Không thể kết nối Facebook Page");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (initialProvider === "telegram") void startTelegram();
    if (initialProvider === "zalo") void startZalo();
  }, [initialProvider]);

  async function submitPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!qr) return;
    setError(null);
    setLoading(true);
    try {
      setQr(await apiRequest<QrStatus>("", `/api/v1/channels/telegram-personal/qr/${qr.id}/password`, token, { method: "POST", body: JSON.stringify({ password }) }, refresh));
      setPassword("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Không thể xác minh mật khẩu Telegram");
    } finally {
      setLoading(false);
    }
  }

  const provider = connectionProviders.find((item) => item.id === selected) ?? connectionProviders[0];
  return <div className={`fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 transition-all duration-300 ease-out motion-reduce:transition-none ${closing ? "opacity-0" : "opacity-100"}`} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
    <section ref={dialogRef} className={`flex max-h-[calc(100vh-2rem)] w-full max-w-[1120px] flex-col bg-white rounded-2xl shadow-xl overflow-hidden transition-all duration-300 ease-out motion-reduce:transition-none ${closing ? "opacity-0 scale-95" : "opacity-100 scale-100"}`} role="dialog" aria-modal="true" aria-labelledby="connect-modal-title">
      <header className="flex shrink-0 items-center justify-between border-b border-slate-200/80 px-5 py-[18px] sm:px-7 sm:py-[22px]"><h2 id="connect-modal-title" className="m-0 text-[15px] font-bold text-slate-700 sm:text-xl">Thêm kết nối</h2><button ref={closeButtonRef} className="cursor-pointer border-0 bg-transparent text-[25px] leading-none text-slate-400 transition-colors hover:text-slate-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500" type="button" aria-label="Đóng" onClick={requestClose}>×</button></header>
      <div className="min-h-0 flex-1 overflow-y-auto"><div className="grid min-h-[540px] grid-cols-1 sm:grid-cols-[260px_minmax(0,1fr)]">
        <nav className="flex max-h-none gap-1 overflow-x-auto border-b border-slate-200 bg-slate-50/70 p-3 sm:block sm:max-h-[540px] sm:overflow-y-auto sm:border-r sm:border-b-0" aria-label="Nền tảng kết nối">
          {connectionProviders.map((item) => <button key={item.id} type="button" className={`flex min-h-16 min-w-[150px] w-full shrink-0 cursor-pointer items-center gap-3 rounded-xl border-0 px-3.5 py-3 text-left text-[15px] transition-[background-color,transform] duration-150 hover:translate-x-0.5 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-sky-500 motion-reduce:transition-none ${selected === item.id ? "bg-gray-100 font-semibold text-gray-900" : "bg-transparent text-slate-700"}`} onClick={() => { setSelected(item.id); if (item.id !== "telegram") setQr(null); if (item.id !== "zalo") setZaloQr(null); setError(null); if (item.id === "telegram") void startTelegram(); if (item.id === "zalo") void startZalo(); }}><PlatformIcon provider={item.id} menu size={36} /><span>{item.label}</span>{item.badge && <small className="bg-yellow-100/80 text-yellow-700 text-[10px] font-medium px-2 py-0.5 rounded-full ml-auto">{item.badge}</small>}</button>)}
        </nav>
        <div className="min-w-0">
          <div className="flex items-center justify-between border-b border-slate-200/70 px-5 py-4 text-[13px] font-bold text-slate-700 sm:px-[30px] sm:py-5"><span>Thêm tài khoản {provider.label}</span>{(provider.id === "telegram" || provider.id === "zalo") && <span className="text-[10px] text-sky-500">●</span>}</div>
          {selected === "telegram" ? <TelegramConnectContent error={error} image={image} loading={loading} onStart={() => void startTelegram()} onSubmit={submitPassword} password={password} qr={qr} setPassword={setPassword} /> : selected === "zalo" ? <ZaloConnectContent error={error} image={zaloImage} loading={loading} onStart={() => void startZalo()} qr={zaloQr} /> : selected === "facebook" ? <FacebookConnectContent error={error} loading={loading} onStart={() => void startFacebook()} onSelect={selectFacebookPage} pages={oauthPages} selectedPageId={oauthSelectedPageId} setSelectedPageId={setOauthSelectedPageId} /> : <div className="px-9 py-[70px] text-center"><span className="mx-auto mb-[18px] grid h-[54px] w-[54px] place-items-center rounded-full bg-blue-50 text-[28px] text-sky-500">◷</span><h3 className="m-0 text-[17px] font-bold text-slate-800">{provider.label} đang chờ kích hoạt</h3><p className="text-[13px] text-slate-500">Tích hợp kênh này sẽ được bổ sung trong phiên bản tiếp theo.</p></div>}
        </div></div>
      </div>
    </section>
  </div>;
}

function FacebookConnectContent({ pages, selectedPageId, setSelectedPageId, error, loading, onStart, onSelect }: { pages: FacebookOAuthPage[]; selectedPageId: string; setSelectedPageId: (value: string) => void; error: string | null; loading: boolean; onStart: () => void; onSelect: () => void }) {
  if (pages.length > 0) return <div className="px-6 py-10 sm:px-12 sm:py-16"><h3 className="m-0 text-xl font-bold text-slate-800">Chọn Facebook Page</h3><p className="mt-2 text-sm text-slate-500">Chọn Page mà tài khoản Facebook của anh có quyền quản lý và đăng bài.</p><div className="mt-6 grid gap-3">{pages.map((page) => <label className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 ${selectedPageId === page.id ? "border-sky-500 bg-sky-50" : "border-slate-200"}`} key={page.id}><input type="radio" name="facebook-page" value={page.id} checked={selectedPageId === page.id} onChange={() => setSelectedPageId(page.id)} disabled={!page.canPublish} /><span className="min-w-0 flex-1"><strong className="block text-sm text-slate-800">{page.name}</strong><small className="text-xs text-slate-500">{page.canPublish ? "Có quyền đăng bài" : "Không có quyền đăng bài"}</small></span></label>)}</div><button className="mt-6 rounded-lg bg-sky-500 px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50" type="button" onClick={onSelect} disabled={loading || !selectedPageId}>{loading ? "Đang kết nối..." : "Kết nối Page này"}</button>{error && <p className="text-xs text-rose-600" role="alert">{error}</p>}</div>;
  return <div className="px-9 py-[70px] text-center"><span className="mx-auto mb-[18px] grid h-[54px] w-[54px] place-items-center rounded-full bg-blue-50 text-[28px] text-sky-500">f</span><h3 className="m-0 text-[17px] font-bold text-slate-800">Đăng nhập bằng tài khoản Facebook</h3><p className="mx-auto mt-3 max-w-md text-[13px] leading-6 text-slate-500">Đăng nhập Facebook để lấy danh sách Page anh đang quản lý, sau đó chọn Page muốn kết nối vào NhuuChat.</p><button className="mt-6 rounded-lg bg-[#1877f2] px-5 py-3 text-sm font-bold text-white hover:bg-[#166fe5] disabled:cursor-wait disabled:opacity-60" type="button" onClick={onStart} disabled={loading}>{loading ? "Đang chuyển tới Facebook..." : "Đăng nhập bằng Facebook"}</button>{error && <p className="mt-4 text-xs text-rose-600" role="alert">{error}</p>}<p className="mt-7 text-xs text-slate-400">Luồng nhập Page ID và Page Access Token thủ công vẫn được giữ nguyên trong mục Bài viết.</p></div>;
}

function TelegramConnectContent({ qr, image, error, loading, password, setPassword, onStart, onSubmit }: { qr: QrStatus | null; image: string | null; error: string | null; loading: boolean; password: string; setPassword: (value: string) => void; onStart: () => void; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void }) {
  if (qr?.status === "connected") return <div className="px-9 py-[70px] text-center"><span className="mx-auto mb-[18px] grid h-[54px] w-[54px] place-items-center rounded-full bg-emerald-50 text-[28px] text-emerald-600">✓</span><h3 className="m-0 text-[17px] font-bold text-emerald-700">Đã kết nối Telegram thành công</h3><p className="text-[13px] text-slate-500">Tài khoản Telegram đã sẵn sàng đồng bộ tin nhắn.</p></div>;
  if (qr?.status === "password_required") return <div className="px-9 py-[70px] text-center"><h3 className="m-0 mb-4 text-[17px] font-bold text-slate-800">Telegram yêu cầu mật khẩu 2FA</h3><p className="text-[13px] text-slate-500">{qr.passwordHint ?? "Nhập mật khẩu xác minh hai bước của Telegram."}</p><form className="mx-auto max-w-[300px] text-left" onSubmit={onSubmit}><label className="grid gap-2 text-xs text-slate-600">Mật khẩu Telegram<input className="rounded-lg border border-slate-200 px-3 py-2.5 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" /></label>{(error ?? qr.error) && <p className="text-xs text-rose-600" role="alert">{error ?? qr.error}</p>}{qr.error === "TELEGRAM_2FA_PASSWORD_INVALID" && <p className="text-xs text-rose-600" role="alert">Mật khẩu không đúng, hãy thử lại.</p>}<button className="mt-5 rounded-lg border border-sky-500 bg-sky-500 px-4 py-2.5 text-xs font-bold text-white transition-colors hover:bg-sky-600 disabled:cursor-wait disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500" type="submit" disabled={loading}>{loading ? "Đang xác minh..." : "Xác minh mật khẩu"}</button></form><button className="mt-3 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-50" type="button" onClick={onStart}>Tạo phiên QR mới</button></div>;
  if (qr?.status === "failed") return <div className="px-9 py-[70px] text-center"><span className="mx-auto mb-[18px] grid h-[54px] w-[54px] place-items-center rounded-full bg-rose-50 text-[28px] text-rose-600">!</span><h3 className="m-0 text-[17px] font-bold text-slate-800">Không thể kết nối Telegram</h3><p className="text-[13px] text-rose-600" role="alert">{error ?? qr.error ?? "Không thể tạo mã QR"}</p><button className="mt-5 rounded-lg border border-sky-500 bg-sky-500 px-4 py-2.5 text-xs font-bold text-white transition-colors hover:bg-sky-600 disabled:cursor-wait disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500" type="button" onClick={onStart} disabled={loading}>{loading ? "Đang tạo mã QR..." : "Thử lại"}</button></div>;
  return <div className="grid grid-cols-1 items-center gap-6 px-5 py-7 sm:grid-cols-2 sm:gap-12 sm:px-14 sm:py-[60px]"><div>{image ? <div className="relative mx-auto w-[300px] max-w-full p-2.5 before:pointer-events-none before:absolute before:inset-0 before:bg-[linear-gradient(#159bd7,#159bd7)_left_top/28px_3px_no-repeat,linear-gradient(#159bd7,#159bd7)_left_top/3px_28px_no-repeat,linear-gradient(#159bd7,#159bd7)_right_top/28px_3px_no-repeat,linear-gradient(#159bd7,#159bd7)_right_top/3px_28px_no-repeat] after:pointer-events-none after:absolute after:inset-0 after:bg-[linear-gradient(#159bd7,#159bd7)_left_bottom/28px_3px_no-repeat,linear-gradient(#159bd7,#159bd7)_left_bottom/3px_28px_no-repeat,linear-gradient(#159bd7,#159bd7)_right_bottom/28px_3px_no-repeat,linear-gradient(#159bd7,#159bd7)_right_bottom/3px_28px_no-repeat]"><figure className="m-0 text-center"><img className="mx-auto block w-[280px] max-w-full" src={image} alt="Mã QR đăng nhập Telegram" /><figcaption className="mt-2.5 text-[11px] text-slate-400">Quét mã QR bằng ứng dụng Telegram</figcaption></figure></div> : <QrLoadingState platform="Telegram" loading={loading} />}</div><div><h3 className="m-0 mb-6 text-xl font-bold text-slate-800">Quét QR để đăng nhập Telegram</h3><ol className="m-0 list-decimal space-y-1 pl-5 text-[15px] leading-[2.4] text-slate-600"><li>Mở ứng dụng Telegram <span className="inline-grid h-5 w-5 align-[-5px] place-items-center rounded bg-slate-100 [&_.platform-icon]:block"><PlatformIcon provider="telegram" size={16} /></span> trên di động</li><li>Ở mục <strong className="text-slate-700">Cài đặt</strong>, chọn thiết bị <span className="ml-1 align-[-3px] font-bold text-sky-600">▣</span></li><li>Nhấn <strong className="text-slate-700">Link Desktop Device</strong> <span className="ml-1 align-[-3px] font-bold text-sky-600">▦</span> và quét QR để đăng nhập</li></ol><div className="mt-7 flex items-center gap-2 border-t border-slate-200/70 pt-[22px] text-sm text-slate-500"><span className="grid h-5 w-5 place-items-center rounded-full border border-current font-bold">?</span><a className="text-sky-600 underline" href="#connection-help" onClick={(event) => event.preventDefault()}>Hướng dẫn kết nối</a></div>{!image && <button className="mt-5 rounded-lg border border-sky-500 bg-sky-500 px-4 py-2.5 text-xs font-bold text-white transition-colors hover:bg-sky-600 disabled:cursor-wait disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500" type="button" onClick={onStart} disabled={loading}>{loading ? "Đang tạo mã QR..." : "Tạo mã QR"}</button>}{error && <p className="text-xs text-rose-600" role="alert">{error}</p>}</div></div>;
}

function ZaloConnectContent({ qr, image, error, loading, onStart }: { qr: ZaloQrStatus | null; image: string | null; error: string | null; loading: boolean; onStart: () => void }) {
  if (qr?.status === "connected") return <div className="px-9 py-[70px] text-center"><span className="mx-auto mb-[18px] grid h-[54px] w-[54px] place-items-center rounded-full bg-emerald-50 text-[28px] text-emerald-600">✓</span><h3 className="m-0 text-[17px] font-bold text-emerald-700">Đã kết nối Zalo thành công</h3><p className="text-[13px] text-slate-500">Tài khoản Zalo đã sẵn sàng đồng bộ tin nhắn.</p></div>;
  if (qr?.status === "expired" || qr?.status === "error") return <div className="px-9 py-[70px] text-center"><span className="mx-auto mb-[18px] grid h-[54px] w-[54px] place-items-center rounded-full bg-rose-50 text-[28px] text-rose-600">!</span><h3 className="m-0 text-[17px] font-bold text-slate-800">Không thể kết nối Zalo</h3><p className="text-xs text-rose-600" role="alert">{error ?? qr.errorCode ?? "Mã QR đã hết hạn hoặc kết nối thất bại."}</p><button className="mt-5 rounded-lg border border-sky-500 bg-sky-500 px-4 py-2.5 text-xs font-bold text-white disabled:cursor-wait disabled:opacity-60" type="button" onClick={onStart} disabled={loading}>{loading ? "Đang tạo mã QR..." : "Tạo mã QR mới"}</button></div>;
  return <div className="grid grid-cols-1 items-center gap-6 px-5 py-7 sm:grid-cols-2 sm:gap-12 sm:px-14 sm:py-[60px]"><div>{image ? <figure className="m-0 text-center"><img className="mx-auto block w-[280px] max-w-full" src={image} alt="Mã QR đăng nhập Zalo" /><figcaption className="mt-2.5 text-[11px] text-slate-400">Quét mã QR bằng ứng dụng Zalo</figcaption></figure> : <QrLoadingState platform="Zalo" loading={loading} />}</div><div><h3 className="m-0 mb-6 text-xl font-bold text-slate-800">Quét QR để kết nối Zalo</h3><ol className="m-0 list-decimal space-y-1 pl-5 text-[15px] leading-[2.4] text-slate-600"><li>Mở ứng dụng Zalo trên điện thoại</li><li>Chọn <strong className="text-slate-700">Quét mã QR</strong></li><li>Quét mã để kết nối tài khoản</li></ol>{!image && <button className="mt-5 rounded-lg border border-sky-500 bg-sky-500 px-4 py-2.5 text-xs font-bold text-white disabled:cursor-wait disabled:opacity-60" type="button" onClick={onStart} disabled={loading}>{loading ? "Đang tạo mã QR..." : "Tạo mã QR"}</button>}{image && <p className="mt-5 text-sm text-slate-500">Đang chờ quét mã...</p>}{error && <p className="text-xs text-rose-600" role="alert">{error}</p>}</div></div>;
}

function QrLoadingState({ platform, loading }: { platform: "Telegram" | "Zalo"; loading: boolean }) {
  return <div className="grid min-h-[190px] place-items-center text-center text-slate-400 sm:min-h-[260px]" role="status" aria-live="polite">
    <div className="flex flex-col items-center gap-4">
      <svg className="h-28 w-28 text-sky-500" viewBox="0 0 112 112" fill="none" aria-hidden="true">
        <rect x="18" y="18" width="76" height="76" rx="16" stroke="currentColor" strokeWidth="2" opacity="0.18" />
        <path d="M40 22H22V40M72 22H90V40M90 72V90H72M40 90H22V72" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        <path d="M31 31h10v10H31zM71 31h10v10H71zM31 71h10v10H31zM50 31h8v8h-8zM50 50h8v8h-8zM65 50h8v8h-8zM50 65h8v8h-8zM65 65h8v8h-8z" fill="currentColor" opacity="0.7" />
        <rect x="22" y="22" width="68" height="3" rx="1.5" fill="currentColor">
          <animate attributeName="y" values="22;87;22" dur="1.8s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.35;1;0.35" dur="1.8s" repeatCount="indefinite" />
        </rect>
        <circle cx="56" cy="56" r="5" fill="currentColor" opacity="0.25">
          <animate attributeName="r" values="4;9;4" dur="1.8s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.2;0.65;0.2" dur="1.8s" repeatCount="indefinite" />
        </circle>
      </svg>
      <p className="m-0 text-xs">{loading ? `Đang tạo mã QR ${platform}...` : `Đang chờ mã QR ${platform}...`}</p>
    </div>
  </div>;
}
