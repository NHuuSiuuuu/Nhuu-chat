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
  return <header className="sticky top-0 z-40 border-b border-slate-100/80 bg-white/90 backdrop-blur">
    <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 lg:px-8">
      <Brand />
      <nav className="hidden items-center gap-9 text-sm font-medium text-slate-500 md:flex" aria-label="Điều hướng chính">
        {landingLinks.map(([label, href]) => <a key={href} className="transition hover:text-blue-600" href={href}>{label}</a>)}
      </nav>
      <div className="flex items-center gap-2">
        <select aria-label="Chọn ngôn ngữ" className="hidden bg-transparent px-2 py-2 text-xs font-semibold text-slate-500 outline-none sm:block"><option>VN</option><option>EN</option></select>
        <button type="button" aria-label={mobileMenuOpen ? "Đóng menu điều hướng" : "Mở menu điều hướng"} aria-controls="mobile-navigation" aria-expanded={mobileMenuOpen} onClick={onMobileMenuToggle} className="rounded-lg border border-slate-200 p-2 text-slate-600 md:hidden"><span className="sr-only">Menu</span><span className="block h-0.5 w-5 bg-current" /><span className="mt-1 block h-0.5 w-5 bg-current" /><span className="mt-1 block h-0.5 w-5 bg-current" /></button>
        {user ? <><button type="button" onClick={onDashboard} aria-label={`Mở Dashboard cho ${user.email}`} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-blue-300 hover:text-blue-700"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-[10px] text-white">{user.email.charAt(0).toUpperCase()}</span><span className="hidden max-w-[140px] truncate sm:block">{user.email}</span></button><button type="button" aria-label="Đăng xuất" onClick={onLogout} className="hidden px-3 py-2 text-xs font-semibold text-slate-600 hover:text-blue-600 sm:block">Đăng xuất</button></> : <><button type="button" aria-label="Đăng nhập" onClick={onLogin} className="hidden px-3 py-2 text-xs font-semibold text-slate-600 hover:text-blue-600 sm:block">Đăng nhập</button><button type="button" aria-label="Đăng ký" onClick={onRegister} className="rounded-lg border border-blue-600 px-4 py-2 text-xs font-semibold text-blue-600 transition hover:bg-blue-600 hover:text-white">Đăng ký miễn phí</button></>}
      </div>
    </div>
    {mobileMenuOpen && <nav id="mobile-navigation" aria-label="Điều hướng trên thiết bị di động" className="border-t border-slate-100 px-5 py-3 md:hidden"><div className="mx-auto flex max-w-6xl flex-col gap-1">{landingLinks.map(([label, href]) => <a key={href} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:text-blue-600" href={href} onClick={onMobileLinkClick}>{label}</a>)}</div></nav>}
  </header>;
}
