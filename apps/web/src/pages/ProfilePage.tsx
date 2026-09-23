import * as React from "react";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { DashboardTopbar, type DashboardAccount } from "../components/dashboard/DashboardTopbar.js";
import { InboxIcon } from "../components/conversations/InboxIcon.js";
import { apiRequest } from "../lib/api.js";
import { resolveApiBaseUrl } from "../lib/api-url.js";

const API_URL = resolveApiBaseUrl(import.meta.env.VITE_API_URL);

export interface CurrentUser {
  id: string;
  displayName: string;
  email: string;
  avatarUrl?: string | null;
}

interface ApiCurrentUser {
  id?: string;
  displayName?: string | null;
  name?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
}

export function normalizeCurrentUser(currentUser: ApiCurrentUser, fallback: DashboardAccount = { email: "", role: "agent" }): CurrentUser {
  const displayName = currentUser.displayName?.trim() || currentUser.name?.trim() || fallback.displayName?.trim() || fallback.username?.trim() || fallback.email.split("@")[0] || "Tài khoản";
  return { id: currentUser.id ?? "", displayName, email: currentUser.email?.trim() || fallback.email, avatarUrl: currentUser.avatarUrl ?? fallback.avatarUrl };
}

export async function fetchCurrentUser(token: string, refresh?: () => Promise<string | null>): Promise<CurrentUser> {
  const currentUser = await apiRequest<ApiCurrentUser>(API_URL, "/api/v1/me", token, {}, refresh);
  return normalizeCurrentUser(currentUser);
}

function initialUser(user: DashboardAccount): CurrentUser {
  return { id: "", displayName: user.displayName ?? user.username ?? user.email.split("@")[0] ?? "Tài khoản", email: user.email, avatarUrl: user.avatarUrl };
}

function Avatar({ name, avatarUrl, onChange }: { name: string; avatarUrl?: string | null; onChange: (event: ChangeEvent<HTMLInputElement>) => void }) {
  const initial = (name || "Tài khoản").trim().slice(0, 1).toUpperCase() || "T";
  return <div className="relative size-16 shrink-0"><div className="grid size-16 place-items-center overflow-hidden rounded-full bg-sky-100 text-xl font-bold text-gray-900">{avatarUrl ? <img className="size-full object-cover" src={avatarUrl} alt={`Avatar ${name}`} /> : initial}</div><label className="absolute -bottom-1 -right-1 grid size-7 cursor-pointer place-items-center rounded-full border-2 border-white bg-sky-600 text-white shadow-sm transition hover:bg-sky-700" aria-label="Đổi ảnh đại diện" title="Đổi ảnh đại diện"><InboxIcon name="camera" size={14} /><input className="sr-only" type="file" accept="image/*" onChange={onChange} aria-label="Đổi ảnh đại diện" /></label></div>;
}

export function ProfilePage({ token, refresh, user, onLogoClick, onNavigate, onLogout, onProfile }: { token: string; refresh?: () => Promise<string | null>; user: DashboardAccount; onLogoClick?: () => void; onNavigate?: (item: "Hộp thư" | "Đơn hàng" | "Bài viết" | "Thống kê" | "Cài đặt") => void; onLogout?: () => void; onProfile?: () => void }) {
  const [profile, setProfile] = useState(() => initialUser(user));
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [profileError, setProfileError] = useState("");
  const [profileNotice, setProfileNotice] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordNotice, setPasswordNotice] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const fileInputUrl = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchCurrentUser(token, refresh).then((currentUser) => { if (!cancelled) { setProfile(currentUser); setDisplayName(currentUser.displayName); } }).catch(() => { if (!cancelled) setProfileError("Không thể tải thông tin hồ sơ."); }).finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [token, refresh]);

  function changeAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (fileInputUrl.current) URL.revokeObjectURL(fileInputUrl.current);
    fileInputUrl.current = URL.createObjectURL(file);
    setProfile((current) => ({ ...current, avatarUrl: fileInputUrl.current }));
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setProfileError(""); setProfileNotice("");
    const nextName = displayName.trim();
    if (!nextName) { setProfileError("Tên hiển thị không được để trống."); return; }
    setIsSaving(true);
    try { const updated = await apiRequest<CurrentUser>(API_URL, "/api/v1/me", token, { method: "PATCH", body: JSON.stringify({ displayName: nextName }) }, refresh); setProfile(updated); setDisplayName(updated.displayName); setProfileNotice("Đã lưu thay đổi."); } catch { setProfileError("Không thể lưu thay đổi."); } finally { setIsSaving(false); }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPasswordError(""); setPasswordNotice("");
    if (newPassword !== confirmPassword) { setPasswordError("Mật khẩu mới không khớp."); return; }
    setIsChangingPassword(true);
    try { await apiRequest<void>(API_URL, "/api/v1/me/password", token, { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) }, refresh); setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); setPasswordNotice("Đã đổi mật khẩu."); } catch { setPasswordError("Không thể đổi mật khẩu."); } finally { setIsChangingPassword(false); }
  }

  return <main className="min-h-screen bg-gray-50 pt-16 text-gray-800 max-[700px]:pt-28"><DashboardTopbar user={{ ...user, displayName: profile.displayName, avatarUrl: profile.avatarUrl }} onLogoClick={onLogoClick} onNavigate={onNavigate} onLogout={onLogout} onProfile={onProfile} /><div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-10"><h1 className="text-3xl font-bold text-gray-900">Hồ sơ của tôi</h1>
    <section className="mt-6 rounded-xl bg-white p-5 shadow-sm sm:p-7" aria-labelledby="personal-information-title"><h2 className="text-lg font-bold text-gray-900" id="personal-information-title">Thông tin cá nhân</h2><div className="mt-6 flex items-center gap-4 border-b border-gray-100 pb-6"><Avatar name={profile.displayName} avatarUrl={profile.avatarUrl} onChange={changeAvatar} /><div className="min-w-0"><p className="truncate text-lg font-bold text-gray-900">{profile.displayName}</p><p className="truncate text-sm text-gray-500">{profile.email}</p></div></div><form className="mt-6 grid gap-5" onSubmit={saveProfile}><label className="grid gap-1.5 text-sm font-semibold text-gray-700">Tên hiển thị<input className="rounded-lg border border-gray-200 px-3 py-2.5 font-normal text-gray-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100" value={displayName} onChange={(event) => setDisplayName(event.target.value)} disabled={isLoading || isSaving} /></label><label className="grid gap-1.5 text-sm font-semibold text-gray-700">Email<input className="cursor-not-allowed rounded-lg border border-gray-200 bg-gray-100 px-3 py-2.5 font-normal text-gray-500 outline-none" value={profile.email} disabled readOnly /><span className="text-xs font-normal text-gray-500">Chưa hỗ trợ đổi email.</span></label>{profileError && <p className="text-sm text-rose-600" role="alert">{profileError}</p>}{profileNotice && <p className="text-sm text-emerald-600" role="status">{profileNotice}</p>}<button className="ml-auto rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer" type="submit" disabled={isLoading || isSaving}>{isSaving ? "Đang lưu..." : "Lưu thay đổi"}</button></form></section>
    <section className="mt-5 rounded-xl bg-white p-5 shadow-sm sm:p-7" aria-labelledby="change-password-title"><h2 className="text-lg font-bold text-gray-900" id="change-password-title">Đổi mật khẩu</h2><p className="mt-1 text-sm text-gray-500">Đổi xong sẽ đăng xuất khỏi mọi thiết bị khác, chỉ giữ phiên đang dùng.</p><form className="mt-6 grid gap-5" onSubmit={changePassword}><label className="grid gap-1.5 text-sm font-semibold text-gray-700">Mật khẩu hiện tại<input className="rounded-lg border border-gray-200 px-3 py-2.5 font-normal text-gray-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label><label className="grid gap-1.5 text-sm font-semibold text-gray-700">Mật khẩu mới<input className="rounded-lg border border-gray-200 px-3 py-2.5 font-normal text-gray-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label><label className="grid gap-1.5 text-sm font-semibold text-gray-700">Nhập lại mật khẩu mới<input className="rounded-lg border border-gray-200 px-3 py-2.5 font-normal text-gray-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label>{passwordError && <p className="text-sm text-rose-600" role="alert">{passwordError}</p>}{passwordNotice && <p className="text-sm text-emerald-600" role="status">{passwordNotice}</p>}<button className="ml-auto rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer" type="submit" disabled={isChangingPassword}>{isChangingPassword ? "Đang đổi..." : "Đổi mật khẩu"}</button></form></section>
  </div></main>;
}
