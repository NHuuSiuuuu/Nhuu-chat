import * as React from "react";
import { useEffect, useState } from "react";
import QRCode from "qrcode";

import { apiRequest } from "../lib/api.js";

interface QrStatus { id: string; status: "waiting" | "password_required" | "connected" | "failed"; qrUrl: string | null; expiresAt: string | null; error: string | null; passwordHint: string | null; }

export function TelegramPersonalPage({ token, refresh, onBack }: { token: string; refresh?: () => Promise<string | null>; onBack: () => void }) {
  const [qr, setQr] = useState<QrStatus | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [submittingPassword, setSubmittingPassword] = useState(false);
  useEffect(() => { if (!qr || (qr.status !== "waiting" && qr.status !== "password_required")) return; const timer = window.setInterval(() => { void apiRequest<QrStatus>("", `/api/v1/channels/telegram-personal/qr/${qr.id}`, token, {}, refresh).then(setQr).catch(() => undefined); }, 2000); return () => window.clearInterval(timer); }, [qr, token, refresh]);
  useEffect(() => { if (!qr?.qrUrl) { setImage(null); return; } void QRCode.toDataURL(qr.qrUrl, { width: 280, margin: 2 }).then(setImage).catch(() => setError("Không thể tạo mã QR")); }, [qr?.qrUrl]);
  async function start() { setError(null); try { setQr(await apiRequest<QrStatus>("", "/api/v1/channels/telegram-personal/qr", token, { method: "POST" }, refresh)); } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Không thể tạo mã QR"); } }
  async function submitPassword(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setError(null); setSubmittingPassword(true); try { setQr(await apiRequest<QrStatus>("", `/api/v1/channels/telegram-personal/qr/${qr?.id}/password`, token, { method: "POST", body: JSON.stringify({ password }) }, refresh)); setPassword(""); } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Không thể gửi mật khẩu Telegram"); } finally { setSubmittingPassword(false); } }
  return <main aria-labelledby="telegram-title"><button onClick={onBack}>← Dashboard</button><h1 id="telegram-title">Kết nối Telegram cá nhân</h1><p>Mở Telegram trên điện thoại, vào Settings → Devices → Link Desktop Device rồi quét mã QR.</p>{!qr && <button onClick={() => void start()}>Tạo mã QR</button>}{image && <figure><img src={image} alt="Mã QR đăng nhập Telegram" /><figcaption>Mã QR hết hạn nhanh; hãy quét ngay.</figcaption></figure>}{qr?.status === "password_required" && <><form onSubmit={submitPassword}><p>Telegram yêu cầu mật khẩu xác minh hai bước{qr.passwordHint ? ` (${qr.passwordHint})` : ""}.</p><label>Mật khẩu Telegram<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" /></label>{qr.error === "TELEGRAM_2FA_PASSWORD_INVALID" && <p role="alert">Mật khẩu Telegram không đúng, hãy thử lại.</p>}<button type="submit" disabled={submittingPassword}>{submittingPassword ? "Đang xác minh..." : "Xác minh mật khẩu"}</button></form><button type="button" onClick={() => void start()}>Tạo phiên QR mới</button></>}{qr?.status === "connected" && <p role="status">Đã kết nối Telegram thành công.</p>}{qr?.status === "failed" && <p role="alert">{qr.error ?? "Kết nối Telegram thất bại"}</p>}{error && <p role="alert">{error}</p>}</main>;
}
