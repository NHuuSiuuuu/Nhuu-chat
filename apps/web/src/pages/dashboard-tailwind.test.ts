import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Dashboard Tailwind migration", () => {
  it("does not import handwritten Dashboard styles", () => {
    const page = readFileSync(new URL("./DashboardPage.tsx", import.meta.url), "utf8");
    const topbar = readFileSync(new URL("../components/dashboard/DashboardTopbar.tsx", import.meta.url), "utf8");
    const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
    const icon = readFileSync(new URL("../components/dashboard/PlatformIcon.tsx", import.meta.url), "utf8");

    expect(page).not.toMatch(/Dashboard(Page|Header)\.css/);
    expect(topbar).not.toMatch(/DashboardHeader\.css/);
    expect(page).toContain("min-h-screen");
    expect(page).toContain('${active ? "bg-[#159fe0] text-white" : "bg-[#e7edf4] text-[#7f8b9b]"}');
    expect(topbar).not.toContain("-mx-7");
    expect(topbar).not.toContain("mb-[26px]");
    expect(page).toContain("pt-16");
    expect(icon).toContain(">?</span>");
    expect(icon).not.toContain("provider.slice");
    expect(app).toContain("bg-slate-100");
    expect(app).toContain("focus:border-sky-500");
  });

  it("uses the full Zalo wordmark for the plain platform identity", () => {
    const icon = readFileSync(new URL("../components/dashboard/PlatformIcon.tsx", import.meta.url), "utf8");
    const plainIcons = icon.slice(0, icon.indexOf('  if (provider === "all")'));

    expect(plainIcons).toContain('if (provider === "zalo") return <svg className="block shrink-0" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path fill="#0068FF" d="M12.49 10.2722v-.4496h1.3467v6.3218h-.7704a.576.576 0 01-.5763-.5729l-.0006.0005a3.273 3.273 0 01-1.9372.6321c-1.8138 0-3.2844-1.4697-3.2844-3.2823 0-1.8125 1.4706-3.2822 3.2844-3.2822a3.273 3.273 0 011.9372.6321l.0006.0005z');
    expect(plainIcons).not.toContain('M6.2 7.2h7.1v2.05');
  });

  it("uses the same real Zalo logo path for the badge identity", () => {
    const icon = readFileSync(new URL("../components/dashboard/PlatformIcon.tsx", import.meta.url), "utf8");
    const badgeIcons = icon.slice(icon.indexOf('  if (provider === "all")'));

    expect(badgeIcons).toContain('M12.49 10.2722v-.4496h1.3467v6.3218');
    expect(badgeIcons).not.toContain('M6.2 7.2h7.1v2.05');
  });
});
