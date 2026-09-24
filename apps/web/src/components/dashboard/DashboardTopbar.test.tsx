import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("DashboardTopbar", () => {
  it("keeps the shared brand, navigation, and owner identity", () => {
    const source = readFileSync(new URL("./DashboardTopbar.tsx", import.meta.url), "utf8");

    expect(source).toContain("bg-blue-600");
    expect(source).toContain("min-h-16");
    expect(source).not.toContain("-mx-");
    expect(source).not.toContain("mb-");
    expect(source).toContain('src="/nhuu-logo.svg"');
    expect(source).toContain('alt="NhuuChat"');
    expect(source).toContain('className="h-10 w-[112px] object-contain"');
    const logo = readFileSync(new URL("../../../public/nhuu-logo.svg", import.meta.url), "utf8");
    expect(logo).not.toContain("<rect");
    expect(source).toContain("nhuusiuu");
    expect(source).toContain("OWNER");
    expect(source).toContain("Hộp thư");
  });

  it("exposes clickable brand and conversation navigation callbacks", () => {
    const source = readFileSync(new URL("./DashboardTopbar.tsx", import.meta.url), "utf8");

    expect(source).toContain("onLogoClick");
    expect(source).toContain("onNavigate");
    expect(source).toContain("onNavigate?.(item)");
    expect(source).toContain("dashboardNavItems");
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

  it("shows the active Workspace picker with searchable role choices in the shared header", () => {
    const source = readFileSync(new URL("./DashboardTopbar.tsx", import.meta.url), "utf8");

    expect(source).toContain("useWorkspacePicker");
    expect(source).toContain('aria-label="Chọn Workspace"');
    expect(source).toContain('aria-label="Tìm Workspace"');
    expect(source).toContain("Tên Workspace");
    expect(source).toContain("Quyền");
    expect(source).toContain("onSelectWorkspace");
  });

  it("adds a mobile hamburger that opens a sliding navigation drawer", () => {
    const source = readFileSync(new URL("./DashboardTopbar.tsx", import.meta.url), "utf8");

    expect(source).toContain("isMobileMenuOpen");
    expect(source).toContain("Mở menu điều hướng");
    expect(source).toContain("translate-x-0");
    expect(source).toContain("-translate-x-full");
    expect(source).toContain("Đóng menu điều hướng");
    expect(source).toContain("max-[767px]:hidden");
  });

  it("renders nested settings items without navigating from the parent", () => {
    const source = readFileSync(new URL("./DashboardTopbar.tsx", import.meta.url), "utf8");

    expect(source).toContain("nestedSettingsSubmenuItems");
    expect(source).toContain("isMobileSettingsOpen");
    expect(source).toContain("isMobileNestedSettingsOpen");
    expect(source).toContain("navigateSettingsFromMobile(settingsItem)");
  });
});
