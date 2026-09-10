import * as React from "react";
import { dashboardNavItems } from "../../state/dashboard-ui.js";

export function DashboardTopbar({ onLogoClick, onNavigate }: { onLogoClick?: () => void; onNavigate?: (item: typeof dashboardNavItems[number]) => void } = {}) {
  return <header className="flex min-h-16 items-center bg-blue-600 px-7 text-white max-[700px]:flex-wrap max-[700px]:items-start max-[700px]:gap-[14px] max-[700px]:p-[14px]">
    <button className="flex min-w-[220px] items-center gap-2.5 border-0 bg-transparent p-0 text-left text-lg text-white max-[900px]:min-w-[150px] max-[700px]:min-w-0" type="button" onClick={onLogoClick} aria-label="Về Dashboard"><span className="grid h-8 w-8 place-items-center rounded-[10px] border-2 border-white/80 text-[17px] font-extrabold">NH</span><strong>NhuuChat</strong></button>
    <nav className="flex flex-1 items-center justify-center gap-[30px] max-[900px]:gap-4 max-[700px]:order-3 max-[700px]:w-full max-[700px]:justify-start max-[700px]:gap-5 max-[700px]:overflow-auto max-[700px]:pt-0.5" aria-label="Điều hướng chính">{dashboardNavItems.map((item) => <a className="whitespace-nowrap text-[15px] font-semibold text-white/90 no-underline" href="#" key={item} onClick={(event) => { event.preventDefault(); onNavigate?.(item); }}>{item}</a>)}</nav>
    <div className="relative grid min-w-[120px] pr-[18px] text-right text-sm max-[700px]:ml-auto"><span>nhuusiuu</span><small className="mt-[3px] text-[9px] tracking-[.08em] text-white/60">OWNER</small><span className="absolute right-0 top-[7px] text-[17px] text-white/80">⌄</span></div>
  </header>;
}
