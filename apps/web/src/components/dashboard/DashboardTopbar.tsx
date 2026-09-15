import * as React from "react";
import { useState } from "react";
import { dashboardNavItems } from "../../state/dashboard-ui.js";
import { InboxIcon } from "../conversations/InboxIcon.js";

export interface DashboardAccount {
  email: string;
  role: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string | null;
}

interface DashboardTopbarProps {
  onLogoClick?: () => void;
  onNavigate?: (item: typeof dashboardNavItems[number]) => void;
  user?: DashboardAccount | null;
  onLogout?: () => void;
  onProfile?: () => void;
}

const fallbackAccount: DashboardAccount = { email: "", role: "OWNER", username: "nhuusiuu", displayName: "nhuusiuu" };

export function DashboardTopbar({ onLogoClick, onNavigate, user, onLogout, onProfile }: DashboardTopbarProps = {}) {
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const account = user ?? fallbackAccount;
  const isLoading = user === null;
  const accountName = isLoading ? "Đang tải..." : account.displayName ?? account.username ?? account.email.split("@")[0] ?? "Tài khoản";
  const accountInitial = accountName.slice(0, 1).toUpperCase();
  const role = account.role.toUpperCase();

  function toggleAccountMenu() {
    if (!isLoading) setIsAccountMenuOpen((current) => !current);
  }

  function logout() {
    setIsAccountMenuOpen(false);
    onLogout?.();
  }

  function openProfile() {
    setIsAccountMenuOpen(false);
    onProfile?.();
  }

  return <div className="min-h-16 max-[700px]:min-h-28"><header className="fixed top-0 left-0 right-0 z-50 flex min-h-16 items-center bg-blue-600 px-7 text-white max-[700px]:flex-wrap max-[700px]:items-start max-[700px]:gap-[14px] max-[700px]:p-[14px]">
    <a className="flex min-w-[220px] items-center gap-2.5 text-left text-lg text-white no-underline max-[900px]:min-w-[150px] max-[700px]:min-w-0" href="/dashboard" onClick={(event) => { if (onLogoClick) { event.preventDefault(); onLogoClick(); } }} aria-label="Về Dashboard"><span className="grid h-8 w-8 place-items-center rounded-[10px] border-2 border-white/80 text-[17px] font-extrabold">NH</span><strong>NhuuChat</strong></a>
    <nav className="flex flex-1 items-center justify-center gap-[30px] max-[900px]:gap-4 max-[700px]:order-3 max-[700px]:w-full max-[700px]:justify-start max-[700px]:gap-5 max-[700px]:overflow-auto max-[700px]:pt-0.5" aria-label="Điều hướng chính">{dashboardNavItems.map((item) => <a className="whitespace-nowrap text-[15px] font-semibold text-white/90 no-underline" href={item === "Hội thoại" ? "/inbox" : "#"} key={item} onClick={(event) => { event.preventDefault(); onNavigate?.(item); }}>{item}</a>)}</nav>
    <div className="relative flex min-w-[190px] items-center justify-end gap-2.5 max-[700px]:ml-auto">
      <div className="grid text-right text-sm"><span>{accountName}</span><small className="mt-[3px] text-[9px] tracking-[.08em] text-white/60">{role}</small></div>
      <button className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full border border-white/70 bg-white/20 text-sm font-bold text-white transition hover:bg-white/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white" type="button" aria-label="Mở menu tài khoản" aria-expanded={isAccountMenuOpen} onClick={toggleAccountMenu}>{account.avatarUrl ? <img className="size-full object-cover" src={account.avatarUrl} alt={`Avatar ${accountName}`} /> : accountInitial}</button>
      <span className="text-sm text-white/80" aria-hidden="true">⌄</span>
      {isAccountMenuOpen && <div className="absolute right-0 top-[calc(100%+10px)] z-50 w-72 origin-top-right animate-[composer-dialog-in_180ms_ease-out] rounded-xl bg-white text-left text-gray-700 shadow-lg ring-1 ring-black/5">
        <div className="border-b border-gray-100 px-4 py-3"><p className="text-base font-bold text-gray-900">{account.displayName ?? account.username ?? accountName}</p><p className="mt-1 text-sm text-gray-500">{account.email}</p></div>
        <div className="p-1.5"><button className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition hover:bg-gray-50" type="button" onClick={openProfile}><InboxIcon name="users" size={18} /> Hồ sơ</button><button className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition hover:bg-gray-50" type="button" onClick={logout}><InboxIcon name="reply" size={18} /> Đăng xuất</button></div>
      </div>}
    </div>
  </header></div>;
}
