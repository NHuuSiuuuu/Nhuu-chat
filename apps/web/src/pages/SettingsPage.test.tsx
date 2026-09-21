import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as settingsModule from "./SettingsPage";

describe("Settings page", () => {
  it("restores a persisted assistant before falling back to the default assistant", () => {
    const assistants = [
      { id: "default", isDefault: true },
      { id: "assistant-1", isDefault: false }
    ];

    expect(settingsModule.resolveInitialAssistantId(assistants, "assistant-1")).toBe("assistant-1");
    expect(settingsModule.resolveInitialAssistantId(assistants, "deleted-assistant")).toBe("default");
  });

  it("exposes publish and unpublish states for automatic chatbot replies", () => {
    const source = readFileSync(new URL("./SettingsPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("publicationButtonLabel");
    expect(source).toContain("Đang hoạt động");
    expect(source).toContain("Chưa hoạt động");
    expect(source).toContain("Gỡ xuất bản");
    expect(source).toContain('body: JSON.stringify({ enabled: !selected.enabled })');
  });

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

    expect(source).toContain('settingsItemFromPath(window.location.pathname)');
    expect(source).toContain('settingsItems[0]');
  });

  it("maps settings tabs to stable URL paths and restores the tab from the path", () => {
    expect(typeof settingsModule.settingsPathForItem).toBe("function");
    expect(typeof settingsModule.settingsItemFromPath).toBe("function");

    if (typeof settingsModule.settingsPathForItem === "function" && typeof settingsModule.settingsItemFromPath === "function") {
      expect(settingsModule.settingsPathForItem("Cài đặt chung")).toBe("/settings/general");
      expect(settingsModule.settingsPathForItem("Thẻ hội thoại")).toBe("/settings/conversation-tags");
      expect(settingsModule.settingsPathForItem("Hỗ trợ trả lời")).toBe("/settings/quick-replies");
      expect(settingsModule.settingsItemFromPath("/settings/ai-assistant")).toBe("Trợ lý AI");
      expect(settingsModule.settingsItemFromPath("/settings/unknown")).toBe("Giới thiệu");
    }
  });

  it("adds the introduction tab with the requested navigation sections", () => {
    const source = readFileSync(new URL("./SettingsPage.tsx", import.meta.url), "utf8");

    expect(source).toContain('"Giới thiệu"');
    expect(source).toContain('"Tổng quan"');
    expect(source).toContain('"Dashboard"');
    expect(source).toContain('"Đa tài khoản"');
    expect(source).toContain('"Quản lý tin nhắn"');
    expect(source).toContain('"Trợ lý AI"');
    expect(source).toContain('"Bảo mật & dữ liệu"');
    expect(source).toContain("activeSection");
    expect(source).toContain("Nhuu-chat");
    expect(source).toContain("MongoDB");
  });

  it("maps the introduction tab to a stable settings URL", () => {
    expect(settingsModule.settingsPathForItem("Giới thiệu" as never)).toBe("/settings/about");
    expect(settingsModule.settingsItemFromPath("/settings/about")).toBe("Giới thiệu");
  });

  it("renders the multi-account introduction with numbered steps and merged-page guidance", () => {
    const source = readFileSync(new URL("./SettingsPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("Đăng nhập nhiều tài khoản ở các kênh khác");
    expect(source).toContain('icon="user"');
    expect(source).toContain('icon="layers"');
    expect(source).toContain("flex gap-4 mb-4");
    expect(source).toContain("h-8 w-8");
    expect(source).toContain("Chế độ gộp trang");
    expect(source).toContain("Chọn pages để chat");
    expect(source).toContain("Lưu ý quan trọng");
    expect(source).toContain("Tài khoản Zalo phải là tài khoản cá nhân hoặc tài khoản doanh nghiệp hợp lệ");
    expect(source).toContain("App không hỗ trợ tài khoản đã bị Zalo khóa hoặc giới hạn tính năng");
    expect(source).toContain("Đăng nhập thông qua QR Code");
    expect(source).toContain("cookie hết hạn");
    expect(source).toContain("chỉ gộp các tài khoản đang online");
  });

  it("keeps the Settings sidebar visible and marks important notes with an alert icon", () => {
    const source = readFileSync(new URL("./SettingsPage.tsx", import.meta.url), "utf8");

    expect(source).toContain('name="alert"');
    expect(source).toContain("lg:sticky lg:top-[88px]");
  });

  it("aligns the sticky sidebar threshold with its initial position below the header", () => {
    const source = readFileSync(new URL("./SettingsPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("lg:sticky lg:top-[88px]");
    expect(source).toContain("lg:h-[calc(100vh-112px)]");
  });

  it("organizes overview, AI, and security guidance with SVG-led sections", () => {
    const source = readFileSync(new URL("./SettingsPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("Ứng dụng này được xây dựng dành cho ai?");
    expect(source).toContain("Tính năng nổi bật");
    expect(source).toContain("Tính năng Trợ lý AI");
    expect(source).toContain("Hướng dẫn sử dụng Trợ lý AI");
    expect(source).toContain('icon="users"');
    expect(source).toContain('icon="sparkles"');
    expect(source).toContain('icon="shield"');
    expect(source).toContain("items-start");
    expect(source).toContain("lg:h-[calc(100vh-112px)]");
    expect(source).toContain("lg:overflow-y-auto");
  });

  it("keeps SVG icons in section headings and uses plain bullets for child items", () => {
    const source = readFileSync(new URL("./SettingsPage.tsx", import.meta.url), "utf8");
    const bulletGroup = source.split("function AboutBulletGroup")[1]?.split("function AboutSettings")[0] ?? "";

    expect(bulletGroup).toContain('className="mt-5 list-disc ml-5 pl-2"');
    expect(bulletGroup).not.toContain("<InboxIcon name={icon} size={16} />");
  });

  it("marks unfinished settings tabs as development placeholders", () => {
    expect(typeof settingsModule.isSettingsPlaceholderTab).toBe("function");

    if (typeof settingsModule.isSettingsPlaceholderTab === "function") {
      expect([
        "Cài đặt chung",
        "Hỗ trợ trả lời",
        "Giao diện",
        "Cuộc gọi",
        "Chế độ xoay vòng",
        "Đồng bộ",
        "Công cụ",
        "Phân quyền",
        "Lịch sử"
      ].every((item) => settingsModule.isSettingsPlaceholderTab(item as never))).toBe(true);
      expect(settingsModule.isSettingsPlaceholderTab("Thẻ hội thoại" as never)).toBe(false);
      expect(settingsModule.isSettingsPlaceholderTab("Trợ lý AI" as never)).toBe(false);
    }
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

  it("renders the chatbot automation workspace instead of a placeholder", () => {
    const source = readFileSync(new URL("./SettingsPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("selectedAssistant");
    expect(source).toContain("isKnowledgeModalOpen");
    expect(source).toContain("Chọn tài liệu kiến thức");
    expect(source).toContain("Tạo chatbot mới");
    expect(source).toContain("Gemini 2.5 Flash");
    expect(source).toContain("Gửi tin nhắn");
    expect(source).not.toContain("Chatbot tự động đang được phát triển.");
  });

  it("connects the knowledge modal to real text and markdown document ingestion", () => {
    const source = readFileSync(new URL("./SettingsPage.tsx", import.meta.url), "utf8");

    expect(source).toContain('"/api/v1/knowledge"');
    expect(source).toContain('accept=".txt,.md,text/plain,text/markdown"');
    expect(source).toContain("FileReader");
    expect(source).toContain("loadKnowledgeDocuments");
    expect(source).toContain("deleteKnowledgeDocument");
    expect(source).toContain("Thêm tài liệu");
  });

  it("connects the chatbot preview to the assistant API instead of clearing the draft only", () => {
    const source = readFileSync(new URL("./SettingsPage.tsx", import.meta.url), "utf8");

    expect(source).toContain('"/api/v1/assistants"');
    expect(source).toContain("BotPreviewResponse");
    expect(source).toContain("/preview");
    expect(source).toContain('method: "POST"');
    expect(source).toContain('method: "PATCH"');
    expect(source).toContain("saveAssistant");
    expect(source).toContain("Lưu hướng dẫn");
    expect(source).toContain("void saveAssistant()");
    expect(source).toContain("Không thể lưu hướng dẫn trợ lý");
    expect(source).toContain("Tư vấn khách hàng");
    expect(source).toContain("Không thể gửi tin nhắn thử nghiệm");
    expect(source).toContain('isDefault: true');
    expect(source).toContain("sendPreview");
  });

  it("allows selecting and persisting the chatbot model tier", () => {
    const source = readFileSync(new URL("./SettingsPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("modelTierByLabel");
    expect(source).toContain("modelLabelByTier");
    expect(source).toContain("setModelTier");
    expect(source).toContain('aria-label="Model chatbot"');
    expect(source).toContain("Thông minh nhất");
    expect(source).toContain("Cân bằng");
    expect(source).toContain("Tiết kiệm");
    expect(source).toContain('body: JSON.stringify({ modelTier })');
    expect(source).toContain("gemini-3.5-flash");
    expect(source).toContain("gemini-3.6-flash");
    expect(source).toContain("gemini-3.5-flash-lite");
    expect(source).toContain("Model đang sử dụng");
  });

  it("provides CRUD controls for assistant greeting templates", () => {
    const source = readFileSync(new URL("./SettingsPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("/templates");
    expect(source).toContain("loadTemplates");
    expect(source).toContain("saveTemplate");
    expect(source).toContain("deleteTemplate");
    expect(source).toContain("Mẫu chào");
    expect(source).toContain("Thêm mẫu chào");
    expect(source).toContain("Import kịch bản");
    expect(source).toContain("/templates/import");
    expect(source).toContain("AutomationTemplateImportModal");
    expect(source).toContain("Sửa mẫu chào");
    expect(source).toContain("Xóa mẫu chào");
    expect(source).toContain("Cho phép Gemini viết lại");
    expect(source).toContain("allowAiRewrite");
    expect(styles).toContain('[aria-label="Cấu hình chatbot"] > .mt-3.grid.gap-2 {');
    expect(styles).toContain('overflow-y: auto;');
    expect(styles).toContain('scrollbar-width: none;');
  });

  it("uses the wide AI assistant content layout from the UI prompt", () => {
    const source = readFileSync(new URL("./SettingsPage.tsx", import.meta.url), "utf8");
    const layout = source.split("function SettingsLayout")[1]?.split("export function SettingsPage")[0] ?? "";

    expect(layout).toContain("mx-6");
    expect(layout).toContain("pt-6");
    expect(layout).toContain("w-[300px]");
    expect(layout).toContain("max-[1024px]:flex-col");
    expect(layout).toContain("rounded-xl bg-white shadow-sm");
    expect(layout).not.toContain("max-w-6xl gap-6 px-6 py-8 max-[800px]:flex-col");
  });

  it("uses one shared responsive layout for every settings tab", () => {
    const source = readFileSync(new URL("./SettingsPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("function SettingsLayout");
    expect(source.match(/<SettingsLayout/g)?.length).toBe(4);
    expect(source).not.toContain('if (activeTab === "Trợ lý AI") return <main');
    expect(source).not.toContain('if (activeTab === "Hỗ trợ trả lời") return <main');
  });

  it("renders a delete action for assistants in the left list", () => {
    const source = readFileSync(new URL("./SettingsPage.tsx", import.meta.url), "utf8");

    expect(source.match(/aria-label=\{`Xóa \$\{assistant\.name\}`\}/g)?.length).toBe(1);
    expect(source).toContain("group-hover:visible");
  });

  it("keeps the selected assistant name on the chat header as display-only text", () => {
    const source = readFileSync(new URL("./SettingsPage.tsx", import.meta.url), "utf8");

    expect(source).not.toContain("isAssistantDropdownOpen");
    expect(source).not.toContain("assistantMenuRef");
    expect(source).toContain('aria-label="Tên trợ lý hiện tại"');
  });

  it("asks for an assistant name before creating a new assistant", () => {
    const source = readFileSync(new URL("./SettingsPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("isCreateAssistantModalOpen");
    expect(source).toContain("newAssistantName");
    expect(source).toContain("Tên trợ lý");
    expect(source).toContain("Tạo chatbot");
    expect(source).not.toContain("Chatbot mới ${id - 2}");
  });

  it("shows the selected assistant context and puts instructions before model settings", () => {
    const source = readFileSync(new URL("./SettingsPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("Áp dụng cho Page:");
    expect(source).toContain("Nguyễn Ngọc Hữu");
    expect(source).toContain('aria-label="Hướng dẫn"');
    expect(source).toContain("Xem mẫu");
    expect(source).toContain("AI rules");
    expect(source).toContain("Viết lại");
    expect(source.indexOf('aria-label="Hướng dẫn"')).toBeLessThan(source.indexOf('aria-label="Model chatbot"'));
  });

  it("arranges the chatbot workspace as instructions, configuration, and chat columns", () => {
    const source = readFileSync(new URL("./SettingsPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("Chat mới");
    expect(source).toContain("Xuất bản");
    expect(source).toContain("lg:grid-cols-[minmax(300px,1fr)_minmax(250px,0.9fr)_minmax(300px,1fr)]");
    expect(source.indexOf('aria-label="Hướng dẫn"')).toBeLessThan(source.indexOf('aria-label="Cấu hình chatbot"'));
    expect(source).toContain("isAssistantMenuOpen");
  });

  it("opens the assistant selector from the default assistant header and exposes delete actions", () => {
    const source = readFileSync(new URL("./SettingsPage.tsx", import.meta.url), "utf8");

    expect(source).toContain('aria-label="Mở danh sách chatbot"');
    expect(source).toContain('aria-label={`Xóa chatbot ${assistant.name}`}');
    expect(source).toContain('method: "DELETE"');
    expect(source).toContain("Tạo chatbot mới");
    expect(source).toContain("group-hover:visible");
  });

  it("uses Chat mới to clear the preview conversation instead of creating an assistant", () => {
    const source = readFileSync(new URL("./SettingsPage.tsx", import.meta.url), "utf8");
    const chatbot = source.split("function ChatbotAutomationSettings({")[1]?.split("function AiAssistantSettings")[0] ?? "";

    expect(chatbot).toContain('aria-label="Xóa nội dung chat thử nghiệm"');
    expect(chatbot).toContain("setMessages([])");
    expect(chatbot).not.toContain('onClick={() => { setNewAssistantName(""); setIsCreateOpen(true); }}');
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

  it("shows the development placeholder for quick replies", () => {
    const source = readFileSync(new URL("./SettingsPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("isSettingsPlaceholderTab(activeTab)");
    expect(source).toContain("Chức năng đang được phát triển");
    expect(source).toContain("aria-disabled={isSettingsPlaceholderTab(item)}");
    expect(source).toContain("handleTabChange(item)");
    expect(source).toContain("cursor-not-allowed");
    expect(source).toContain("<DevelopmentToast");
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

  it("places instruction save and template import actions beside their section headings", () => {
    const source = readFileSync(new URL("./SettingsPage.tsx", import.meta.url), "utf8");
    const normalized = source.replace(/\s+/g, " ");

    expect(normalized).toContain('<div className="flex items-center justify-between border-b border-gray-100 pb-3"><h3 className="text-sm font-bold text-gray-900">Hướng dẫn</h3>');
    expect(normalized).toContain('type="button" onClick={() => void saveAssistant()}');
    expect(normalized).toContain('<div className="mt-5 flex items-center justify-between border-b border-gray-100 pb-3"><h3 className="text-sm font-bold text-gray-800">Mẫu chào</h3>');
    expect(normalized).toContain('type="button" onClick={() => setIsImportModalOpen(true)}');
    expect(source).not.toContain('<div className="mt-3 flex justify-end">');
  });

  it("keeps both individual template creation and file import actions", () => {
    const source = readFileSync(new URL("./SettingsPage.tsx", import.meta.url), "utf8");
    const templateHeader = source.split('<h3 className="text-sm font-bold text-gray-800">Mẫu chào</h3>')[1]?.split("</div>")[0] ?? "";

    expect(templateHeader).toContain("+ Thêm mẫu chào");
    expect(templateHeader).toContain("Import kịch bản");
  });
});
