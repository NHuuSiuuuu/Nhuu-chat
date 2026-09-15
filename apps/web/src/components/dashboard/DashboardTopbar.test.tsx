import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("DashboardTopbar", () => {
  it("keeps the shared brand, navigation, and owner identity", () => {
    const source = readFileSync(new URL("./DashboardTopbar.tsx", import.meta.url), "utf8");

    expect(source).toContain("bg-blue-600");
    expect(source).toContain("min-h-16");
    expect(source).not.toContain("-mx-");
    expect(source).not.toContain("mb-");
    expect(source).toContain("NhuuChat");
    expect(source).toContain("nhuusiuu");
    expect(source).toContain("OWNER");
    expect(source).toContain("Hội thoại");
  });

  it("exposes clickable brand and conversation navigation callbacks", () => {
    const source = readFileSync(new URL("./DashboardTopbar.tsx", import.meta.url), "utf8");

    expect(source).toContain("onLogoClick");
    expect(source).toContain("onNavigate");
    expect(source).toContain("onNavigate?.(item)");
    expect(source).toContain('item === "Hội thoại" ? "/inbox" : "#"');
  });

  it("renders an avatar-triggered account dropdown", () => {
    const source = readFileSync(new URL("./DashboardTopbar.tsx", import.meta.url), "utf8");

    expect(source).toContain("avatarUrl");
    expect(source).toContain("onLogout");
    expect(source).toContain("onProfile");
    expect(source).toContain("Đăng xuất");
    expect(source).toContain("Hồ sơ");
    expect(source).toContain("Đang tải...");
  });
});
