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
});
