import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Dashboard Tailwind migration", () => {
  it("does not import handwritten Dashboard styles", () => {
    const page = readFileSync(new URL("./DashboardPage.tsx", import.meta.url), "utf8");
    const topbar = readFileSync(new URL("../components/dashboard/DashboardTopbar.tsx", import.meta.url), "utf8");

    expect(page).not.toMatch(/Dashboard(Page|Header)\.css/);
    expect(topbar).not.toMatch(/DashboardHeader\.css/);
    expect(page).toContain("min-h-screen");
  });
});
