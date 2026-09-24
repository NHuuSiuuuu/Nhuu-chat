import * as React from "react";
import type { AuthRole } from "../../state/auth.store.js";

interface LandingHeaderProps {
  user: { email: string; role: AuthRole; displayName?: string } | null;
  landingLinks: readonly (readonly [string, string])[];
  mobileMenuOpen: boolean;
  onMobileMenuToggle: () => void;
  onDashboard: () => void;
  onLogin: () => void;
  onRegister: () => void;
  onLogout: () => void;
  onMobileLinkClick: () => void;
  brandHref?: string;
}

function Brand({ href }: { href: string }) {
  return <a href={href} className="flex items-center text-slate-950 cursor-pointer transition-opacity hover:opacity-80" aria-label="NhuuChat - về đầu trang"><img className="h-8 w-[128px] object-contain" src="/nhuu-logo-landing.svg" alt="NhuuChat" /></a>;
}

export function LandingHeader({ user, landingLinks, mobileMenuOpen, onMobileMenuToggle, onDashboard, onLogin, onRegister, onLogout, onMobileLinkClick, brandHref = "#top" }: LandingHeaderProps) {
  const [isScrolled, setIsScrolled] = React.useState(() => typeof window !== "undefined" && window.scrollY > 10);
  const displayName = user?.displayName?.trim() || user?.email.split("@")[0] || "Tài khoản";

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const updateScrolled = () => setIsScrolled(window.scrollY > 10);

    window.addEventListener("scroll", updateScrolled);
    return () => window.removeEventListener("scroll", updateScrolled);
  }, []);

  return <header className={`w-full fixed top-0 left-0 z-50 ${isScrolled ? "bg-white/95 backdrop-blur-md shadow-md py-3" : "bg-transparent py-5"} px-6 md:px-12 flex justify-between items-center transition-all duration-300 ease-in-out`}>
      <Brand href={brandHref} />
      <nav className="hidden md:flex gap-8 text-sm font-medium text-slate-600" aria-label="Điều hướng chính">
        {landingLinks.map(([label, href]) => <a key={href} className="transition hover:text-slate-900 cursor-pointer" href={href}>{label}</a>)}
      </nav>
      <div className="flex min-w-0 items-center gap-1">
        <button type="button" aria-label={mobileMenuOpen ? "Đóng menu điều hướng" : "Mở menu điều hướng"} aria-controls="mobile-navigation" aria-expanded={mobileMenuOpen} onClick={onMobileMenuToggle} className="rounded-lg border border-slate-200 p-2 text-slate-600 md:hidden cursor-pointer transition-opacity hover:opacity-80"><span className="sr-only">Menu</span><span className="block h-0.5 w-5 bg-current" /><span className="mt-1 block h-0.5 w-5 bg-current" /><span className="mt-1 block h-0.5 w-5 bg-current" /></button>
        {user ? <><button type="button" onClick={onDashboard} aria-label={`Mở Dashboard cho ${user.email}`} className="hidden min-w-0 items-center gap-1 rounded-lg border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-700 transition hover:border-blue-300 hover:text-blue-700 md:flex cursor-pointer"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[10px] text-white">{user.email.charAt(0).toUpperCase()}</span><span className="max-w-[72px] truncate">{user.email}</span></button><button type="button" aria-label="Đăng xuất" onClick={onLogout} className="hidden shrink-0 px-2 py-2 text-xs font-semibold text-slate-600 hover:text-blue-600 md:block cursor-pointer">Đăng xuất</button></> : <><button type="button" aria-label="Đăng nhập" onClick={onLogin} className="hidden px-3 py-2 text-xs font-semibold text-slate-600 hover:text-blue-600 md:block cursor-pointer">Đăng nhập</button><button type="button" aria-label="Đăng ký" onClick={onRegister} className="hidden rounded-lg border border-blue-600 px-4 py-2 text-xs font-semibold text-blue-600 transition hover:bg-blue-600 hover:text-white md:block cursor-pointer">Đăng ký miễn phí</button></>}
      </div>
    {mobileMenuOpen && <nav id="mobile-navigation" aria-label="Điều hướng trên thiết bị di động" className="absolute left-0 top-full w-full border-t border-slate-100 bg-white px-5 py-3 md:hidden"><div className="mx-auto flex max-w-6xl flex-col gap-1">{landingLinks.map(([label, href]) => <a key={href} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:text-blue-600 cursor-pointer" href={href} onClick={onMobileLinkClick}>{label}</a>)}{user ? <div className="mt-2 border-t border-slate-100 pt-4"><div role="group" aria-label="Tài khoản đang đăng nhập" className="mb-3 flex min-w-0 items-center gap-3 rounded-lg bg-slate-50 px-3 py-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white">{displayName.charAt(0).toUpperCase()}</span><span className="flex min-w-0 flex-col gap-0.5"><span className="truncate text-sm font-semibold text-slate-700">{displayName}</span><span className="truncate text-xs text-slate-500">{user.email}</span></span></div><button type="button" aria-label="Đăng xuất" onClick={() => { onMobileLinkClick(); onLogout(); }} className="w-full rounded-lg bg-gradient-to-r from-[#0875ff] to-[#09bce9] px-4 py-3 text-sm font-bold text-white shadow-[0_5px_12px_rgba(15,133,242,0.22)] transition hover:brightness-105 cursor-pointer">Đăng xuất</button></div> : <div className="mt-2 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4"><button type="button" aria-label="Đăng nhập" onClick={() => { onLogin(); onMobileLinkClick(); }} className="rounded-lg border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-blue-300 hover:text-blue-700 cursor-pointer">Đăng nhập</button><button type="button" aria-label="Đăng ký" onClick={() => { onRegister(); onMobileLinkClick(); }} className="rounded-lg bg-gradient-to-r from-blue-600 to-cyan-500 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-blue-200 transition hover:-translate-y-0.5 hover:shadow-lg cursor-pointer">Đăng ký miễn phí</button></div>}</div></nav>}
  </header>;
}
