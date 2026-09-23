import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./DashboardTopbar.tsx", import.meta.url), "utf8");

describe("DashboardTopbar fixed layout", () => {
  it("stays fixed above page content", () => {
    expect(source).toContain("fixed left-0 right-0 top-0");
    expect(source).toContain("z-50");
  });

  it("passes the clicked nested section to the mobile navigation callback", () => {
    expect(source).toContain('nestedItems.map((nestedItem) => <button');
    expect(source).toContain('onClick={() => navigateSettingsFromMobile(nestedItem)}');
    expect(source).not.toContain('onClick={() => navigateSettingsFromMobile(settingsItem)}');
  });
});
