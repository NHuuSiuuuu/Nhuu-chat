import * as React from "react";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { resolveApiBaseUrl } from "../../lib/api-url.js";

const API_URL = resolveApiBaseUrl(import.meta.env.VITE_API_URL);

export function ResetPasswordPage({ onNavigateLogin, onResetSuccess }: { onNavigateLogin: () => void; onResetSuccess: () => void }) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState(token ? "" : "Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn");
  const [submitting, setSubmitting] = useState(false);
  const [resetSucceeded, setResetSucceeded] = useState(false);

  // Chỉ xóa token khỏi thanh địa chỉ sau khi API xác nhận mật khẩu đã được cập nhật.
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!token) {
      setError("Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn");
      return;
    }
    if (password !== confirmation) {
      setError("Mật khẩu xác nhận không khớp");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/api/v1/auth/reset-password`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password })
      });
      if (!response.ok) {
        setError(response.status === 400
          ? "Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn"
          : "Không thể đặt lại mật khẩu lúc này. Vui lòng thử lại sau.");
        return;
      }

      navigate("/reset-password", { replace: true });
      setResetSucceeded(true);
      window.setTimeout(onResetSuccess, 1200);
    } catch {
      setError("Không thể đặt lại mật khẩu lúc này. Vui lòng thử lại sau.");
    } finally {
      setSubmitting(false);
    }
  }

  return <div className="flex w-full items-center justify-center text-[#17233b]">
    <section className="w-full max-w-[420px] rounded-[24px] border border-white/80 bg-white/70 p-6 shadow-[0_12px_36px_rgba(73,113,158,0.12)] backdrop-blur-sm sm:p-8" aria-labelledby="reset-password-title">
      <header className="mb-6">
        <h1 id="reset-password-title" className="text-[25px] font-bold tracking-[-0.04em] text-[#14203a]">Đặt lại mật khẩu</h1>
        <p className="mt-1 text-sm leading-5 text-[#7186a5]">Tạo mật khẩu mới có ít nhất 8 ký tự.</p>
      </header>
      {resetSucceeded && <p className="mb-4 rounded-xl bg-emerald-50 px-3 py-2 text-sm leading-5 text-emerald-800" role="status">Mật khẩu đã được cập nhật. Đang chuyển tới trang đăng nhập...</p>}
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <label className="flex flex-col gap-2 text-sm font-semibold text-[#30415d]" htmlFor="reset-password-new">
          Mật khẩu mới
          <input id="reset-password-new" name="password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} className="h-11 rounded-xl border border-[#dce5f0] bg-white/70 px-3.5 text-sm font-normal text-[#17233b] shadow-[0_2px_4px_rgba(42,74,116,0.08)] outline-none transition placeholder:text-[#91a7c3] focus:border-[#4c91ff] focus:bg-white focus:ring-4 focus:ring-[#2b7fff]/10" />
        </label>
        <label className="flex flex-col gap-2 text-sm font-semibold text-[#30415d]" htmlFor="reset-password-confirm">
          Xác nhận mật khẩu mới
          <input id="reset-password-confirm" name="password-confirmation" type="password" autoComplete="new-password" required minLength={8} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="h-11 rounded-xl border border-[#dce5f0] bg-white/70 px-3.5 text-sm font-normal text-[#17233b] shadow-[0_2px_4px_rgba(42,74,116,0.08)] outline-none transition placeholder:text-[#91a7c3] focus:border-[#4c91ff] focus:bg-white focus:ring-4 focus:ring-[#2b7fff]/10" />
        </label>
        {error && <p className="text-sm text-rose-600" role="alert">{error}</p>}
        <button type="submit" disabled={submitting || !token} className="mt-1 flex h-11 items-center justify-center rounded-xl bg-gradient-to-r from-[#0875ff] to-[#09bce9] text-sm font-bold text-white shadow-[0_5px_12px_rgba(15,133,242,0.22)] transition hover:brightness-105 focus:outline-none focus:ring-4 focus:ring-[#0875ff]/20 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer">{submitting ? "Đang cập nhật..." : "Cập nhật mật khẩu"}</button>
      </form>
      <footer className="mt-6 text-center text-sm text-[#7186a5]">
        <button type="button" onClick={onNavigateLogin} className="font-semibold text-[#006eff] hover:underline cursor-pointer">← Quay lại đăng nhập</button>
      </footer>
    </section>
  </div>;
}
