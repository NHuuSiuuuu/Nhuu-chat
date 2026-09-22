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
  settingsSubmenuItems?: readonly string[];
  nestedSettingsSubmenuItems?: Readonly<Record<string, readonly string[]>>;
  activeSettingsSubmenuItem?: string;
  onSettingsSubmenuNavigate?: (item: string) => void;
}

const fallbackAccount: DashboardAccount = { email: "", role: "OWNER", username: "nhuusiuu", displayName: "nhuusiuu" };

export function DashboardTopbar({ onLogoClick, onNavigate, user, onLogout, onProfile, settingsSubmenuItems, nestedSettingsSubmenuItems, activeSettingsSubmenuItem, onSettingsSubmenuNavigate }: DashboardTopbarProps = {}) {
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobileSettingsOpen, setIsMobileSettingsOpen] = useState(false);
  const [isMobileNestedSettingsOpen, setIsMobileNestedSettingsOpen] = useState<string | null>(null);
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

  function toggleMobileMenu() {
    setIsMobileMenuOpen((current) => !current);
  }

  function navigateFromMobile(item: typeof dashboardNavItems[number]) {
    setIsMobileMenuOpen(false);
    onNavigate?.(item);
  }

  function navigateSettingsFromMobile(item: string) {
    setIsMobileMenuOpen(false);
    setIsMobileSettingsOpen(false);
    onSettingsSubmenuNavigate?.(item);
  }

  function toggleNestedSettings(item: string) {
    setIsMobileNestedSettingsOpen((current) => current === item ? null : item);
  }

  return <div className="min-h-16"><header className="fixed left-0 right-0 top-0 z-50 flex min-h-16 items-center justify-between bg-blue-600 px-7 text-white max-[767px]:gap-2 max-[767px]:p-3">
    <div className="flex min-w-0 items-center gap-2">
    <button className="hidden size-9 shrink-0 place-items-center rounded-lg border-0 bg-white/10 text-white transition hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white max-[767px]:inline-grid" type="button" aria-label={isMobileMenuOpen ? "Đóng menu điều hướng" : "Mở menu điều hướng"} aria-expanded={isMobileMenuOpen} onClick={toggleMobileMenu}><svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeLinecap="round" strokeWidth="2" /></svg></button>
    <a className="flex min-w-[220px] items-center gap-2.5 text-left text-lg text-white no-underline max-[900px]:min-w-[150px] max-[767px]:min-w-0" href="/dashboard" onClick={(event) => { if (onLogoClick) { event.preventDefault(); onLogoClick(); } }} aria-label="Về Dashboard">
    <img className="h-10 w-[112px] object-contain" src="/nhuu-logo.svg" alt="NhuuChat" /></a>
    </div>
    <nav className="flex flex-1 items-center justify-center gap-[30px] max-[900px]:gap-4 max-[767px]:hidden" aria-label="Điều hướng chính">{dashboardNavItems.map((item) => <a className="whitespace-nowrap text-[15px] font-semibold text-white/90 no-underline" href={item === "Hộp thư" ? "/inbox" : "#"} key={item} onClick={(event) => { event.preventDefault(); onNavigate?.(item); }}>{item}</a>)}</nav>
    <div className="relative flex min-w-[190px] items-center justify-end gap-2.5 max-[767px]:min-w-0 max-[767px]:ml-auto">
      <div className="grid min-w-0 text-right text-sm"><span className="truncate">{accountName}</span><small className="mt-[3px] text-[9px] tracking-[.08em] text-white/60">{role}</small></div>
      <button className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full border border-white/70 bg-white/20 text-sm font-bold text-white transition hover:bg-white/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white" type="button" aria-label="Mở menu tài khoản" aria-expanded={isAccountMenuOpen} onClick={toggleAccountMenu}>{account.avatarUrl ? <img className="size-full object-cover" src={account.avatarUrl} alt={`Avatar ${accountName}`} /> : accountInitial}</button>
      <span className="text-sm text-white/80" aria-hidden="true">⌄</span>
      {isAccountMenuOpen && <div className="absolute right-0 top-[calc(100%+10px)] z-50 w-72 origin-top-right animate-[composer-dialog-in_180ms_ease-out] rounded-xl bg-white text-left text-gray-700 shadow-lg ring-1 ring-black/5">
        <div className="border-b border-gray-100 px-4 py-3"><p className="text-base font-bold text-gray-900">{account.displayName ?? account.username ?? accountName}</p><p className="mt-1 text-sm text-gray-500">{account.email}</p></div>
        <div className="p-1.5"><button className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition hover:bg-gray-50" type="button" onClick={openProfile}><InboxIcon name="users" size={18} /> Hồ sơ</button><button className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition hover:bg-gray-50" type="button" onClick={logout}><InboxIcon name="reply" size={18} /> Đăng xuất</button></div>
      </div>}
    </div>
  </header>
  {isMobileMenuOpen && <button className="fixed inset-0 z-[55] bg-slate-950/40 min-[768px]:hidden" type="button" aria-label="Đóng menu điều hướng" onClick={() => setIsMobileMenuOpen(false)} />}
  <aside className={`fixed bottom-0 left-0 top-0 z-[60] w-72 bg-white text-slate-800 shadow-2xl transition-transform duration-200 min-[768px]:hidden ${isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"}`} aria-label="Menu điều hướng mobile" aria-hidden={!isMobileMenuOpen}>
    <div className="flex h-16 items-center justify-between border-b border-slate-100 px-4"><img className="h-9 w-[100px] object-contain" src="/nhuu-logo.svg" alt="NhuuChat" /><button className="grid size-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800" type="button" aria-label="Đóng menu điều hướng" onClick={() => setIsMobileMenuOpen(false)}><InboxIcon name="close" size={19} /></button></div>
    <nav className="grid gap-1 p-3" aria-label="Điều hướng mobile">{dashboardNavItems.map((item) => item === "Cài đặt" && settingsSubmenuItems?.length ? <div className="grid gap-1" key={item}><button className="flex items-center justify-between rounded-lg px-3 py-3 text-left text-sm font-semibold text-slate-700 transition hover:bg-sky-50 hover:text-sky-700" type="button" aria-expanded={isMobileSettingsOpen} aria-controls="mobile-settings-submenu" onClick={() => setIsMobileSettingsOpen((current) => !current)}><span>{item}</span><InboxIcon name={isMobileSettingsOpen ? "chevron-up" : "chevron-down"} size={16} /></button>{isMobileSettingsOpen && <div className="ml-3 grid gap-1 border-l border-slate-200 pl-2" id="mobile-settings-submenu" role="group" aria-label="Menu Cài đặt mobile">{settingsSubmenuItems.map((settingsItem) => { const nestedItems = nestedSettingsSubmenuItems?.[settingsItem]; return <div className="grid gap-1" key={settingsItem}><button className="flex items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition" type="button" aria-expanded={nestedItems ? isMobileNestedSettingsOpen === settingsItem : undefined} onClick={() => nestedItems ? toggleNestedSettings(settingsItem) : navigateSettingsFromMobile(settingsItem)}><span>{settingsItem}</span>{nestedItems && <InboxIcon name={isMobileNestedSettingsOpen === settingsItem ? "chevron-up" : "chevron-down"} size={15} />}</button>{nestedItems && isMobileNestedSettingsOpen === settingsItem && <div className="ml-3 grid gap-1 border-l border-slate-100 pl-2" role="group" aria-label={`${settingsItem} submenu`}>{nestedItems.map((nestedItem) => <button className="rounded-lg px-3 py-2 text-left text-xs text-slate-600 hover:bg-slate-50" type="button" key={nestedItem} onClick={() => navigateSettingsFromMobile(settingsItem)}>{nestedItem}</button>)}</div>}</div>; })}</div>}</div> : <button className="rounded-lg px-3 py-3 text-left text-sm font-semibold text-slate-700 transition hover:bg-sky-50 hover:text-sky-700" type="button" key={item} onClick={() => navigateFromMobile(item)}>{item}</button>)}</nav>
  </aside>
  </div>;
}
