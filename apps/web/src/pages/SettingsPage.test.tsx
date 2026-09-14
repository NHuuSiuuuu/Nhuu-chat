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

  it("renders the AI assistant settings design with interactive controls", () => {
    const source = readFileSync(new URL("./SettingsPage.tsx", import.meta.url), "utf8");

    expect(source).toContain('activeTab === "Trợ lý AI"');
    expect(source).toContain("Gợi ý trả lời");
    expect(source).toContain("Chatbot tự động");
    expect(source).toContain("Mô hình AI");
    expect(source).toContain("Thanh toán");
    expect(source).toContain("Gợi ý trả lời tin nhắn từ AI");
    expect(source).toContain("Phát hiện cảm xúc của khách hàng");
    expect(source).toContain("Thông minh nhất");
    expect(source).toContain("Khi mở hội thoại");
    expect(source).toContain("AI Sentiment");
    expect(source).toContain("setSuggestionsEnabled");
  });

  it("keeps AI switches and setting controls inside their layout", () => {
    const source = readFileSync(new URL("./SettingsPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("left-1");
    expect(source).toContain("translate-x-5");
    expect(source).toContain("border-0 p-0");
    expect(source).toContain("min-w-0 shrink-0 flex-wrap");
    expect(source).toContain("max-w-full");
  });

  it("persists AI settings through the backend", () => {
    const source = readFileSync(new URL("./SettingsPage.tsx", import.meta.url), "utf8");

    expect(source).toContain('"/api/v1/ai-settings"');
    expect(source).toContain('method: "PATCH"');
    expect(source).toContain("AiSettingsContract");
    expect(source).toContain("onSettingsChange");
  });

  it("renders the quick replies settings page and add modal", () => {
    const source = readFileSync(new URL("./SettingsPage.tsx", import.meta.url), "utf8");

    expect(source).toContain('activeTab === "Hỗ trợ trả lời"');
    expect(source).toContain("isAddQuickReplyModalOpen");
    expect(source).toContain("Trả lời nhanh");
    expect(source).toContain("Thêm mẫu");
    expect(source).toContain("Tìm kiếm tin nhắn");
    expect(source).toContain("Ký tự tắt");
    expect(source).toContain("Nội dung sẽ được chèn khi gõ ký tự tắt ở trên");
    expect(source).toContain("Chưa có mẫu trả lời nhanh");
  });

  it("supports selecting an attached image in the quick reply modal", () => {
    const source = readFileSync(new URL("./SettingsPage.tsx", import.meta.url), "utf8");

    expect(source).toContain('type="file"');
    expect(source).toContain('accept="image/*"');
    expect(source).toContain("attachment");
    expect(source).toContain("Xoá ảnh đính kèm");
  });

  it("loads persisted quick replies and exposes loading, error, and empty states", () => {
    const source = readFileSync(new URL("./SettingsPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("QuickReplyContract");
    expect(source).toContain('"/api/v1/quick-replies"');
    expect(source).toContain('method: "GET"');
    expect(source).toContain("loadQuickReplies");
    expect(source).toContain("Đang tải mẫu trả lời nhanh...");
    expect(source).toContain("Không thể tải danh sách trả lời nhanh");
    expect(source).toContain("Chưa có mẫu trả lời nhanh");
  });

  it("submits quick replies as multipart fields without a JSON content type", () => {
    const settingsSource = readFileSync(new URL("./SettingsPage.tsx", import.meta.url), "utf8");
    const apiSource = readFileSync(new URL("../lib/api.ts", import.meta.url), "utf8");

    expect(settingsSource).toContain("new FormData()");
    expect(settingsSource).toContain('formData.append("shortcut", reply.shortcut)');
    expect(settingsSource).toContain('formData.append("message", reply.message)');
    expect(settingsSource).toContain('formData.append("attachment", reply.attachment)');
    expect(settingsSource).toContain("body: formData");
    expect(apiSource).toContain("init.body instanceof FormData");
  });

  it("renders saved attachment URLs and supports editing or deleting quick replies", () => {
    const source = readFileSync(new URL("./SettingsPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("reply.attachment.secureUrl");
    expect(source).toContain("Ảnh đính kèm của mẫu trả lời nhanh");
    expect(source).toContain("Sửa ${reply.shortcut}");
    expect(source).toContain("Xóa ${reply.shortcut}");
    expect(source).toContain('method: "PATCH"');
    expect(source).toContain('method: "DELETE"');
    expect(source).toContain("Không thể tải ảnh đính kèm");
    expect(source).toContain("Đang lưu...");
    expect(source).toContain("if (saved) setAttachment(null)");
  });

  it("renders quick reply errors at their owning surface without an empty result after GET fails", () => {
    const source = readFileSync(new URL("./SettingsPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("const [pageError, setPageError]");
    expect(source).toContain("const [modalError, setModalError]");
    expect(source).toContain('callbacks.setLoadError("Không thể tải danh sách trả lời nhanh", background)');
    expect(source).toContain("background ? setActionError(message) : setPageError(message)");
    expect(source).toContain("return quickReplySync.load(fetchQuickReplies)");
    expect(source.match(/quickReplySync\.mutate\(/g)).toHaveLength(2);
    expect(source).toContain("return quickReplySync.invalidate");
    expect(source).toContain("error={modalError}");
    expect(source).toContain("pageError ? <p");
    expect(source).toContain("actionError && <p");
  });

  it("preserves dashboard account callbacks through a local compatible props boundary", () => {
    const source = readFileSync(new URL("./SettingsPage.tsx", import.meta.url), "utf8");

    expect(source).not.toContain('import type { DashboardAccount');
    expect(source).toContain("type SettingsDashboardAccount");
    expect(source).toContain("user?: SettingsDashboardAccount | null");
    expect(source).toContain("onLogout?: () => void");
    expect(source).toContain("onProfile?: () => void");
    expect(source).toContain("function SettingsDashboardTopbar");
    expect(source).toContain("props as React.ComponentProps<typeof DashboardTopbar>");
    expect(source).toContain("<SettingsDashboardTopbar onLogoClick={onLogoClick} onNavigate={onNavigate} user={user} onLogout={onLogout} onProfile={onProfile}");
  });
});
