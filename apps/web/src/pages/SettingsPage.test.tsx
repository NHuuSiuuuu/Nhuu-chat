import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Settings page", () => {
  it("follows the Vietnamese conversation-tags design", () => {
    const source = readFileSync(new URL("./SettingsPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("DashboardTopbar");
    expect(source).toContain("Thẻ hội thoại");
    expect(source).toContain("Cài đặt chung");
    expect(source).toContain("Trợ lý AI");
    expect(source).toContain("isAddTagModalOpen");
    expect(source).toContain("Thêm thẻ");
    expect(source).toContain("Tên thẻ");
    expect(source).toContain("Màu thẻ");
    expect(source).toContain("Xem trước");
    expect(source).toContain("Lưu");
    expect(source).toContain("Huỷ");
  });

  it("offers a custom color option and keeps the selected color when saving a tag", () => {
    const source = readFileSync(new URL("./SettingsPage.tsx", import.meta.url), "utf8");

    expect(source).toContain('type="color"');
    expect(source).toContain("Tùy chỉnh màu");
    expect(source).toContain("selectedColor");
    expect(source).toContain("color: selectedColor");
  });

  it("opens on the first settings item by default", () => {
    const source = readFileSync(new URL("./SettingsPage.tsx", import.meta.url), "utf8");

    expect(source).toContain('useState("Cài đặt chung")');
  });

  it("maps each settings option to its corresponding icon", () => {
    const source = readFileSync(new URL("./SettingsPage.tsx", import.meta.url), "utf8");

    expect(source).toContain('"Cài đặt chung": "settings"');
    expect(source).toContain('"Thẻ hội thoại": "tag"');
    expect(source).toContain('"Trợ lý AI": "sparkles"');
    expect(source).toContain('"Hỗ trợ trả lời": "chat"');
    expect(source).toContain('"Giao diện": "monitor"');
    expect(source).toContain('"Cuộc gọi": "phone"');
    expect(source).toContain('"Chế độ xoay vòng": "refresh"');
    expect(source).toContain('"Đồng bộ": "cloud"');
    expect(source).toContain('"Công cụ": "wrench"');
    expect(source).toContain('"Phân quyền": "users"');
    expect(source).toContain('"Lịch sử": "clock"');
  });

  it("connects conversation tag management to the authenticated API", () => {
    const source = readFileSync(new URL("./SettingsPage.tsx", import.meta.url), "utf8");

    expect(source).toContain('import { apiRequest } from "../lib/api.js"');
    expect(source).toContain("ConversationTagContract");
    expect(source).toContain('"/api/v1/conversation-tags"');
    expect(source).toContain('"POST"');
    expect(source).toContain('"PATCH"');
    expect(source).toContain('method: "DELETE"');
    expect(source).toContain("Đang tải thẻ...");
    expect(source).toContain("Không thể tải danh sách thẻ");
  });

  it("passes access token and refresh handler into SettingsPage", () => {
    const source = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");

    expect(source).toContain("<SettingsPage token={auth.accessToken} refresh={refresh}");
  });
});
