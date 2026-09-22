import * as React from "react";
import type { AuthRole } from "../../state/auth.store.js";

interface LandingHeaderProps {
  user: { email: string; role: AuthRole } | null;
  landingLinks: readonly (readonly [string, string])[];
  mobileMenuOpen: boolean;
  onMobileMenuToggle: () => void;
  onDashboard: () => void;
  onLogin: () => void;
  onRegister: () => void;
  onLogout: () => void;
  onMobileLinkClick: () => void;
}

function Brand() {
  return <a href="#top" className="flex items-center text-slate-950" aria-label="NhuuChat - về đầu trang"><img className="h-8 w-[128px] object-contain" src="/nhuu-logo-landing.svg" alt="NhuuChat" /></a>;
}

export function LandingHeader({ user, landingLinks, mobileMenuOpen, onMobileMenuToggle, onDashboard, onLogin, onRegister, onLogout, onMobileLinkClick }: LandingHeaderProps) {
  return <header className="w-full fixed top-0 left-0 z-50 bg-transparent py-5 px-6 md:px-12 flex justify-between items-center">
      <Brand />
      <nav className="hidden md:flex gap-8 text-sm font-medium text-slate-600" aria-label="Điều hướng chính">
        {landingLinks.map(([label, href]) => <a key={href} className="transition hover:text-slate-900" href={href}>{label}</a>)}
      </nav>
      <div className="flex min-w-0 items-center gap-1">
        <select aria-label="Chọn ngôn ngữ" className="hidden bg-transparent px-2 py-2 text-xs font-semibold text-slate-500 outline-none sm:block"><option>VN</option><option>EN</option></select>
        <button type="button" aria-label={mobileMenuOpen ? "Đóng menu điều hướng" : "Mở menu điều hướng"} aria-controls="mobile-navigation" aria-expanded={mobileMenuOpen} onClick={onMobileMenuToggle} className="rounded-lg border border-slate-200 p-2 text-slate-600 md:hidden"><span className="sr-only">Menu</span><span className="block h-0.5 w-5 bg-current" /><span className="mt-1 block h-0.5 w-5 bg-current" /><span className="mt-1 block h-0.5 w-5 bg-current" /></button>
        {user ? <><button type="button" onClick={onDashboard} aria-label={`Mở Dashboard cho ${user.email}`} className="flex min-w-0 items-center gap-1 rounded-lg border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-700 transition hover:border-blue-300 hover:text-blue-700"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[10px] text-white">{user.email.charAt(0).toUpperCase()}</span><span className="max-w-[72px] truncate">{user.email}</span></button><button type="button" aria-label="Đăng xuất" onClick={onLogout} className="shrink-0 px-2 py-2 text-xs font-semibold text-slate-600 hover:text-blue-600">Đăng xuất</button></> : <><button type="button" aria-label="Đăng nhập" onClick={onLogin} className="hidden px-3 py-2 text-xs font-semibold text-slate-600 hover:text-blue-600 sm:block">Đăng nhập</button><button type="button" aria-label="Đăng ký" onClick={onRegister} className="rounded-lg border border-blue-600 px-4 py-2 text-xs font-semibold text-blue-600 transition hover:bg-blue-600 hover:text-white">Đăng ký miễn phí</button></>}
      </div>
    {mobileMenuOpen && <nav id="mobile-navigation" aria-label="Điều hướng trên thiết bị di động" className="absolute left-0 top-full w-full border-t border-slate-100 bg-white px-5 py-3 md:hidden"><div className="mx-auto flex max-w-6xl flex-col gap-1">{landingLinks.map(([label, href]) => <a key={href} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:text-blue-600" href={href} onClick={onMobileLinkClick}>{label}</a>)}</div></nav>}
  </header>;
}
