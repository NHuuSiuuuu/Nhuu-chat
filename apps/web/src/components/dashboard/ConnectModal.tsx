import * as React from "react";
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

import { apiRequest } from "../../lib/api.js";
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

export function ConnectModal({ token, refresh, onClose, onConnected }: { token: string; refresh?: () => Promise<string | null>; onClose: () => void; onConnected: () => void }) {
  const [selected, setSelected] = useState<ConnectionProviderId>(initialConnectionProvider);
  const [qr, setQr] = useState<QrStatus | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [closing, setClosing] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  function requestClose() {
    if (closing) return;
    setClosing(true);
    window.setTimeout(onClose, connectModalCloseDurationMs);
  }

  useEffect(() => {
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
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
  }, [onConnected, qr, refresh, token]);

  useEffect(() => {
    if (!qr?.qrUrl) { setImage(null); return; }
    void QRCode.toDataURL(qr.qrUrl, { width: 260, margin: 2 }).then(setImage).catch(() => setError("Không thể tạo mã QR"));
  }, [qr?.qrUrl]);

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
  return <div className={`fixed inset-0 z-20 grid place-items-center bg-slate-900/50 p-3 backdrop-blur-[5px] transition-opacity duration-200 motion-reduce:transition-none sm:p-6 ${closing ? "opacity-0" : "opacity-100"}`} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
    <section className={`flex max-h-[calc(100vh-2rem)] w-full max-w-[1120px] flex-col overflow-hidden rounded-[20px] bg-white shadow-[0_24px_70px_rgba(15,23,42,0.28)] transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none ${closing ? "translate-y-2 scale-[.98] opacity-0" : "translate-y-0 scale-100 opacity-100"}`} role="dialog" aria-modal="true" aria-labelledby="connect-modal-title">
      <header className="flex shrink-0 items-center justify-between border-b border-slate-200/80 px-5 py-[18px] sm:px-7 sm:py-[22px]"><h2 id="connect-modal-title" className="m-0 text-[15px] font-bold text-slate-700 sm:text-xl">Thêm kết nối</h2><button ref={closeButtonRef} autoFocus className="cursor-pointer border-0 bg-transparent text-[25px] leading-none text-slate-400 transition-colors hover:text-slate-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500" type="button" aria-label="Đóng" onClick={requestClose}>×</button></header>
      <div className="min-h-0 flex-1 overflow-y-auto"><div className="grid min-h-[540px] grid-cols-1 sm:grid-cols-[260px_minmax(0,1fr)]">
        <nav className="flex max-h-none gap-1 overflow-x-auto border-b border-slate-200 bg-slate-50/70 p-3 sm:block sm:max-h-[540px] sm:overflow-y-auto sm:border-r sm:border-b-0" aria-label="Nền tảng kết nối">
          {connectionProviders.map((item) => <button key={item.id} type="button" className={`flex min-h-16 min-w-[150px] w-full shrink-0 cursor-pointer items-center gap-3 rounded-lg border-0 px-3.5 py-3 text-left text-[15px] transition-[background-color,transform] duration-150 hover:translate-x-0.5 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-sky-500 motion-reduce:transition-none ${selected === item.id ? "bg-blue-50 text-slate-900" : "bg-transparent text-slate-700"}`} onClick={() => { setSelected(item.id); if (item.id !== "telegram") { setQr(null); setError(null); } }}><span className={`inline-grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 [&_.platform-icon]:block ${item.id === "pending" ? "bg-amber-100" : ""}`}><PlatformIcon provider={item.id} size={24} /></span><span>{item.label}</span>{item.badge && <small className="ml-auto rounded-lg bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">{item.badge}</small>}</button>)}
        </nav>
        <div className="min-w-0">
          <div className="flex items-center justify-between border-b border-slate-200/70 px-5 py-4 text-[13px] font-bold text-slate-700 sm:px-[30px] sm:py-5 sm:text-[15px]"><span>Thêm tài khoản {provider.label}</span>{provider.id === "telegram" && <span className="text-[10px] text-sky-500">●</span>}</div>
          {selected !== "telegram" ? <div className="px-9 py-[70px] text-center"><span className="mx-auto mb-[18px] grid h-[54px] w-[54px] place-items-center rounded-full bg-blue-50 text-[28px] text-sky-500">◷</span><h3 className="m-0 text-[17px] font-bold text-slate-800">{provider.label} đang chờ kích hoạt</h3><p className="text-[13px] text-slate-500">Tích hợp kênh này sẽ được bổ sung trong phiên bản tiếp theo.</p></div> : <TelegramConnectContent error={error} image={image} loading={loading} onStart={() => void startTelegram()} onSubmit={submitPassword} password={password} qr={qr} setPassword={setPassword} />}
        </div></div>
      </div>
    </section>
  </div>;
}

function TelegramConnectContent({ qr, image, error, loading, password, setPassword, onStart, onSubmit }: { qr: QrStatus | null; image: string | null; error: string | null; loading: boolean; password: string; setPassword: (value: string) => void; onStart: () => void; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void }) {
  if (qr?.status === "connected") return <div className="px-9 py-[70px] text-center"><span className="mx-auto mb-[18px] grid h-[54px] w-[54px] place-items-center rounded-full bg-emerald-50 text-[28px] text-emerald-600">✓</span><h3 className="m-0 text-[17px] font-bold text-emerald-700">Đã kết nối Telegram thành công</h3><p className="text-[13px] text-slate-500">Tài khoản Telegram đã sẵn sàng đồng bộ tin nhắn.</p></div>;
  if (qr?.status === "password_required") return <div className="px-9 py-[70px] text-center"><h3 className="m-0 mb-4 text-[17px] font-bold text-slate-800">Telegram yêu cầu mật khẩu 2FA</h3><p className="text-[13px] text-slate-500">{qr.passwordHint ?? "Nhập mật khẩu xác minh hai bước của Telegram."}</p><form className="mx-auto max-w-[300px] text-left" onSubmit={onSubmit}><label className="grid gap-2 text-xs text-slate-600">Mật khẩu Telegram<input className="rounded-lg border border-slate-200 px-3 py-2.5 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" /></label>{qr.error && <p className="text-xs text-rose-600" role="alert">{qr.error}</p>}{qr.error === "TELEGRAM_2FA_PASSWORD_INVALID" && <p className="text-xs text-rose-600" role="alert">Mật khẩu không đúng, hãy thử lại.</p>}<button className="mt-5 rounded-lg border border-sky-500 bg-sky-500 px-4 py-2.5 text-xs font-bold text-white transition-colors hover:bg-sky-600 disabled:cursor-wait disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500" type="submit" disabled={loading}>{loading ? "Đang xác minh..." : "Xác minh mật khẩu"}</button></form><button className="mt-3 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-50" type="button" onClick={onStart}>Tạo phiên QR mới</button></div>;
  if (qr?.status === "failed") return <div className="px-9 py-[70px] text-center"><span className="mx-auto mb-[18px] grid h-[54px] w-[54px] place-items-center rounded-full bg-rose-50 text-[28px] text-rose-600">!</span><h3 className="m-0 text-[17px] font-bold text-slate-800">Không thể kết nối Telegram</h3><p className="text-[13px] text-rose-600" role="alert">{qr.error ?? "Không thể tạo mã QR"}</p><button className="mt-5 rounded-lg border border-sky-500 bg-sky-500 px-4 py-2.5 text-xs font-bold text-white transition-colors hover:bg-sky-600 disabled:cursor-wait disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500" type="button" onClick={onStart} disabled={loading}>{loading ? "Đang tạo mã QR..." : "Thử lại"}</button></div>;
  return <div className="grid grid-cols-1 items-center gap-6 px-5 py-7 sm:grid-cols-2 sm:gap-12 sm:px-14 sm:py-[60px]"><div>{image ? <div className="relative mx-auto w-[300px] max-w-full p-2.5 before:pointer-events-none before:absolute before:inset-0 before:bg-[linear-gradient(#159bd7,#159bd7)_left_top/28px_3px_no-repeat,linear-gradient(#159bd7,#159bd7)_left_top/3px_28px_no-repeat,linear-gradient(#159bd7,#159bd7)_right_top/28px_3px_no-repeat,linear-gradient(#159bd7,#159bd7)_right_top/3px_28px_no-repeat] after:pointer-events-none after:absolute after:inset-0 after:bg-[linear-gradient(#159bd7,#159bd7)_left_bottom/28px_3px_no-repeat,linear-gradient(#159bd7,#159bd7)_left_bottom/3px_28px_no-repeat,linear-gradient(#159bd7,#159bd7)_right_bottom/28px_3px_no-repeat,linear-gradient(#159bd7,#159bd7)_right_bottom/3px_28px_no-repeat]"><figure className="m-0 text-center"><img className="mx-auto block w-[280px] max-w-full" src={image} alt="Mã QR đăng nhập Telegram" /><figcaption className="mt-2.5 text-[11px] text-slate-400">Quét mã QR bằng ứng dụng Telegram</figcaption></figure></div> : <div className="grid min-h-[190px] place-items-center rounded-xl border border-dashed border-slate-300 text-center text-slate-400 sm:min-h-[260px]"><span className="animate-pulse text-[72px] text-sky-500 motion-reduce:animate-none">▦</span><p className="m-0 text-xs">{loading ? "Đang tạo mã QR..." : "Mã QR sẽ hiển thị tại đây"}</p></div>}</div><div><h3 className="m-0 mb-6 text-xl font-bold text-slate-800">Quét QR để đăng nhập Telegram</h3><ol className="m-0 list-decimal space-y-1 pl-5 text-[15px] leading-[2.4] text-slate-600"><li>Mở ứng dụng Telegram <span className="inline-grid h-5 w-5 align-[-5px] place-items-center rounded bg-slate-100 [&_.platform-icon]:block"><PlatformIcon provider="telegram" size={16} /></span> trên di động</li><li>Ở mục <strong className="text-slate-700">Cài đặt</strong>, chọn thiết bị <span className="ml-1 align-[-3px] font-bold text-sky-600">▣</span></li><li>Nhấn <strong className="text-slate-700">Link Desktop Device</strong> <span className="ml-1 align-[-3px] font-bold text-sky-600">▦</span> và quét QR để đăng nhập</li></ol><div className="mt-7 flex items-center gap-2 border-t border-slate-200/70 pt-[22px] text-sm text-slate-500"><span className="grid h-5 w-5 place-items-center rounded-full border border-current font-bold">?</span><a className="text-sky-600 underline" href="#connection-help" onClick={(event) => event.preventDefault()}>Hướng dẫn kết nối</a></div>{!image && <button className="mt-5 rounded-lg border border-sky-500 bg-sky-500 px-4 py-2.5 text-xs font-bold text-white transition-colors hover:bg-sky-600 disabled:cursor-wait disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500" type="button" onClick={onStart} disabled={loading}>{loading ? "Đang tạo mã QR..." : "Tạo mã QR"}</button>}{error && <p className="text-xs text-rose-600" role="alert">{error}</p>}</div></div>;
}
