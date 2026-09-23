import * as React from "react";
import { useState } from "react";
import { toast } from "sonner";
import type { AuthRole } from "../../state/auth.store.js";
import { resolveApiBaseUrl } from "../../lib/api-url.js";
import { motion, useReducedMotion } from "framer-motion";
import type { AuthRoute } from "./auth-route.js";

const API_URL = resolveApiBaseUrl(import.meta.env.VITE_API_URL);

interface AuthResponse {
  user: { id: string; email: string; role: AuthRole };
}

export type AuthMode = "login" | "register";
type FieldIcon = "lock" | "mail" | "user";

// Chuyển mã lỗi xác thực đã biết thành thông điệp tiếng Việt mà không lộ chuỗi từ máy chủ.
function localizeAuthError(mode: AuthMode, code: string | undefined, message: string): { message: string; invalidCredentials: boolean } {
  if (mode === "login" && (code === "INVALID_CREDENTIALS" || /incorrect|not found|wrong/i.test(message))) {
    return { message: "Email hoặc mật khẩu không chính xác!", invalidCredentials: true };
  }
  if (mode === "register" && code === "DUPLICATE_RESOURCE") {
    return { message: "Email này đã được đăng ký!", invalidCredentials: false };
  }
  if (code === "INVALID_REQUEST") {
    return { message: "Thông tin chưa hợp lệ. Vui lòng kiểm tra lại!", invalidCredentials: false };
  }
  return {
    message: mode === "register"
      ? "Không thể đăng ký lúc này. Vui lòng thử lại!"
      : "Không thể đăng nhập lúc này. Vui lòng thử lại!",
    invalidCredentials: false
  };
}

function AuthField({ id, label, placeholder, type = "text", icon, value, onChange, autoComplete, required, minLength, action, error }: {
  id: string;
  label: string;
  placeholder: string;
  type?: string;
  icon: FieldIcon;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  action?: React.ReactNode;
  error?: string;
}) {
  const [visible, setVisible] = useState(false);
  const paths: Record<FieldIcon, React.ReactNode> = {
    lock: <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>
  };
  return <div className="flex flex-col gap-2">
    <div className="flex items-center justify-between"><label htmlFor={id} className="text-sm font-semibold text-[#30415d]">{label}</label>{action}</div>
    <div className="relative">
      <svg aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 size-[17px] -translate-y-1/2 text-[#8fa6c4]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[icon]}</svg>
      <input id={id} name={id} type={type === "password" && visible ? "text" : type} placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} autoComplete={autoComplete} required={required} minLength={minLength} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} className="h-11 w-full rounded-xl border border-[#dce5f0] bg-white/70 pl-10 pr-11 text-sm text-[#17233b] shadow-[0_2px_4px_rgba(42,74,116,0.08)] outline-none transition placeholder:text-[#91a7c3] focus:border-[#4c91ff] focus:bg-white focus:ring-4 focus:ring-[#2b7fff]/10" />
      {type === "password" && <button type="button" aria-label={visible ? "Ẩn mật khẩu" : "Hiện mật khẩu"} onClick={() => setVisible(value => !value)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#8fa6c4] transition-colors cursor-pointer hover:text-slate-700"><svg aria-hidden="true" className="size-[17px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{visible ? <><path d="M3 3l18 18" /><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" /><path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c5 0 8.5 4.2 9.5 7-.3.9-1 2-2 3" /><path d="M6.2 6.2C3.9 7.7 2.8 9.8 2.5 12c.6 1.8 2 3.7 4.1 5.1A9.5 9.5 0 0 0 12 19c1 0 1.9-.1 2.7-.4" /></> : <><path d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z" /><circle cx="12" cy="12" r="3" /></>}</svg></button>}
    </div>
    {error && <p id={`${id}-error`} className="text-red-500 text-sm mt-1" role="alert">{error}</p>}
  </div>;
}

export function AuthPage({ initialMode = "login", initialView = "login", onAuthenticated, onBack, onNavigateAuth }: { embedded?: boolean; initialMode?: AuthMode; initialView?: AuthMode | "forgot-password"; onAuthenticated: (auth: AuthResponse) => void; onBack?: () => void; onNavigateAuth?: (route: AuthRoute) => void }) {
  const mode = initialMode;
  const [showForgot, setShowForgot] = useState(initialView === "forgot-password");
  const reducedMotion = useReducedMotion();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [error, setError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [forgotNotice, setForgotNotice] = useState("");
  const [forgotError, setForgotError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submitForgot(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setForgotError("");
    setForgotNotice("");
    setSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/api/v1/auth/forgot-password`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim() })
      });
      if (!response.ok) throw new Error("Không thể gửi yêu cầu đặt lại mật khẩu");
      setForgotNotice("Nếu email đã đăng ký, bạn sẽ nhận được liên kết đặt lại mật khẩu.");
    } catch {
      setForgotError("Không thể gửi yêu cầu lúc này. Vui lòng thử lại sau.");
    } finally {
      setSubmitting(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPasswordError("");
    if (mode === "register" && !name.trim()) {
      toast.error("Vui lòng nhập Họ và tên!");
      return;
    }
    if (!email.trim()) {
      toast.error("Vui lòng nhập địa chỉ Email!");
      return;
    }
    if (!password.trim()) {
      toast.error("Vui lòng nhập Mật khẩu!");
      return;
    }
    if (mode === "register" && !passwordConfirmation.trim()) {
      toast.error("Vui lòng nhập lại Mật khẩu!");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast.error("Email không đúng định dạng!");
      return;
    }
    if (password.length < 8) {
      toast.error("Mật khẩu phải có ít nhất 8 ký tự!");
      return;
    }
    if (mode === "register" && password !== passwordConfirmation) {
      setError("Mật khẩu xác nhận không khớp");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/api/v1/auth/${mode}`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), password })
      });
      const body = await response.json() as AuthResponse & { error?: { code?: string; message?: string } };
      if (!response.ok) {
        const localizedError = localizeAuthError(mode, body.error?.code, body.error?.message ?? "");
        if (localizedError.invalidCredentials) setPasswordError(localizedError.message);
        else setError(localizedError.message);
        toast.error(localizedError.message);
        return;
      }
      if (mode === "login") toast.success("Đăng nhập thành công!");
      onAuthenticated(body);
    } catch {
      const message = mode === "register"
        ? "Không thể đăng ký lúc này. Vui lòng thử lại!"
        : "Không thể đăng nhập lúc này. Vui lòng thử lại!";
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  function routeClick(route: AuthRoute) {
    return (event: React.MouseEvent<HTMLAnchorElement>) => {
      if (!onNavigateAuth) return;
      event.preventDefault();
      onNavigateAuth(route);
    };
  }

  const pageClass = "relative flex w-full items-center justify-center overflow-hidden text-[#17233b]";
  const description = showForgot
    ? "Nhập email tài khoản. Nếu email đã đăng ký, bạn sẽ nhận liên kết đặt lại mật khẩu."
    : mode === "login"
      ? "Nhập thông tin tài khoản của bạn để tiếp tục."
      : "Bắt đầu quản lý tin nhắn thông minh cùng NhuuChat.";

  return <div className={pageClass} aria-labelledby="auth-title">
    <motion.section initial={reducedMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reducedMotion ? 0 : 0.35, ease: "easeOut" }} className="relative w-full max-w-[420px] rounded-[24px] border border-white/80 bg-white/70 p-6 shadow-[0_12px_36px_rgba(73,113,158,0.12)] backdrop-blur-sm sm:p-8">
      {/* <a href="/" className="mb-7 inline-flex items-center" aria-label="NhuuChat - về trang chủ"><img className="h-8 w-[128px] object-contain" src="/nhuu-logo-landing.svg" alt="NhuuChat" /></a> */}
      {!showForgot && <nav aria-label="Chuyển trang xác thực" className="mb-7 grid grid-cols-2 rounded-[15px] bg-[#f0f4fa] p-1 shadow-inner">
        <a href="/login" aria-current={mode === "login" ? "page" : undefined} onClick={routeClick("login")} className={`rounded-xl py-3 text-center text-sm transition ${mode === "login" ? "bg-white font-semibold text-[#17233b] shadow-[0_2px_5px_rgba(45,66,95,0.12)]" : "text-[#7185a2] hover:text-[#17233b]"} cursor-pointer`}>Đăng nhập</a>
        <a href="/register" aria-current={mode === "register" ? "page" : undefined} onClick={routeClick("register")} className={`rounded-xl py-3 text-center text-sm transition ${mode === "register" ? "bg-white font-semibold text-[#17233b] shadow-[0_2px_5px_rgba(45,66,95,0.12)]" : "text-[#7185a2] hover:text-[#17233b]"} cursor-pointer`}>Đăng ký</a>
      </nav>}
      <header className="mb-6"><h1 id="auth-title" className="text-[25px] font-bold tracking-[-0.04em] text-[#14203a]">{showForgot ? "Quên mật khẩu?" : mode === "login" ? "Chào mừng quay lại" : "Tạo tài khoản mới"}</h1><p className="mt-1 text-sm leading-5 text-[#7186a5]">{description}</p></header>
      {showForgot ? <form className="flex flex-col gap-4" onSubmit={submitForgot}>
        <AuthField id="forgot-email" label="Email" placeholder="name@example.com" type="email" icon="mail" value={email} onChange={setEmail} autoComplete="email" required />
        <button type="submit" disabled={submitting} className="mt-1 flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#0875ff] to-[#09bce9] text-sm font-bold text-white shadow-[0_5px_12px_rgba(15,133,242,0.22)] transition hover:brightness-105 focus:outline-none focus:ring-4 focus:ring-[#0875ff]/20 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer">{submitting ? "Đang gửi..." : "Gửi link đặt lại mật khẩu"}</button>
        {forgotError && <p className="text-sm text-rose-600" role="alert">{forgotError}</p>}
        {forgotNotice && <p className="rounded-xl bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-800" role="status">{forgotNotice}</p>}
      </form> : <form noValidate className="flex flex-col gap-4" onSubmit={submit}>
        {mode === "register" && <AuthField id="auth-name" label="Họ và tên" placeholder="Nguyễn Văn A" icon="user" value={name} onChange={setName} autoComplete="name" required />}
        <AuthField id="auth-email" label="Email" placeholder="name@example.com" type="email" icon="mail" value={email} onChange={(value) => { setEmail(value); setPasswordError(""); }} autoComplete="email" required />
        <AuthField id="auth-password" label="Mật khẩu" placeholder={mode === "register" ? "Ít nhất 8 ký tự" : "••••••••"} type="password" icon="lock" value={password} onChange={(value) => { setPassword(value); setPasswordError(""); }} autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={8} error={passwordError} action={mode === "login" ? <a href="/forgot-password" onClick={routeClick("forgot-password")} className="text-xs font-medium text-[#0877ff] hover:underline cursor-pointer">Quên mật khẩu?</a> : undefined} />
        {mode === "register" && <AuthField id="auth-password-confirm" label="Nhập lại mật khẩu" placeholder="Nhập lại mật khẩu" type="password" icon="lock" value={passwordConfirmation} onChange={setPasswordConfirmation} autoComplete="new-password" required minLength={8} />}
        {error && <p className="text-sm text-rose-600" role="alert">{error}</p>}
        <button type="submit" disabled={submitting} className="mt-1 flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#0875ff] to-[#09bce9] text-sm font-bold text-white shadow-[0_5px_12px_rgba(15,133,242,0.22)] transition hover:brightness-105 focus:outline-none focus:ring-4 focus:ring-[#0875ff]/20 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer">{submitting ? "Đang xử lý..." : mode === "login" ? "Đăng nhập" : "Đăng ký tài khoản"}<svg aria-hidden="true" className="size-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14m-6-6 6 6-6 6" /></svg></button>
      </form>}
      <footer className="mt-6 text-center text-sm text-[#7186a5]">
        {showForgot ? <a href="/login" onClick={routeClick("login")} className="font-semibold text-[#006eff] hover:underline cursor-pointer">← Quay lại đăng nhập</a> : <>{mode === "login" ? "Chưa có tài khoản? " : "Đã có tài khoản? "}<a href={mode === "login" ? "/register" : "/login"} onClick={routeClick(mode === "login" ? "register" : "login")} className="font-semibold text-[#006eff] hover:underline cursor-pointer">{mode === "login" ? "Đăng ký ngay" : "Đăng nhập ngay"}</a>{onBack && <button type="button" onClick={onBack} className="mt-3 block w-full text-xs text-[#7186a5] hover:text-[#17233b] cursor-pointer">Quay lại trang chủ</button>}</>}
      </footer>
    </motion.section>
  </div>;
}
