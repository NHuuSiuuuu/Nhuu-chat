import * as React from "react";
import { useEffect, useState } from "react";
import type { AiModelTier, AiSentimentWindow, AiSettingsContract, AiSuggestionMode, AssistantContract, AutomationTemplateContract, BotPreviewResponse, ConversationTagContract, QuickReplyContract } from "@nhuu-chat/contracts";
import { DashboardTopbar } from "../components/dashboard/DashboardTopbar.js";
import { InboxIcon } from "../components/conversations/InboxIcon.js";
import { AutomationTemplateImportModal } from "../components/settings/AutomationTemplateImportModal.js";
import { GeneralSettingsPanel } from "../components/settings/GeneralSettingsPanel.js";
import { SettingHistoryTimeline } from "../components/settings/SettingHistoryTimeline.js";
import { apiRequest } from "../lib/api.js";
import { resolveApiBaseUrl } from "../lib/api-url.js";
import { toast } from "sonner";
import type { AutomationTemplateImportRow } from "../lib/automation-template-import.js";

const API_URL = resolveApiBaseUrl(import.meta.env.VITE_API_URL);
const TAGS_API_PATH = "/api/v1/conversation-tags";
const AI_SETTINGS_API_PATH = "/api/v1/ai-settings";
const QUICK_REPLIES_API_PATH = "/api/v1/quick-replies";
const ASSISTANTS_API_PATH = "/api/v1/assistants";
const DEFAULT_AI_SETTINGS: AiSettingsContract = { modelTier: "smart", enabled: true, suggestionsEnabled: true, sentimentEnabled: true, suggestionMode: "on_open", sentimentWindow: 3 };
const modelTierByLabel: Record<string, AiModelTier> = { "Thông minh nhất": "smart", "Cân bằng": "balanced", "Tiết kiệm": "economy" };
const modelLabelByTier: Record<AiModelTier, string> = { smart: "Thông minh nhất", balanced: "Cân bằng", economy: "Tiết kiệm" };
const modelNameByTier: Record<AiModelTier, string> = { smart: "gemini-3.5-flash", balanced: "gemini-3.6-flash", economy: "gemini-3.5-flash-lite" };
const suggestionModeByLabel: Record<string, AiSuggestionMode> = { "Thủ công": "manual", "Khi mở hội thoại": "on_open", "Khi khách nhắn tin": "on_customer_message", "Luôn gợi ý": "on_customer_message" };
const suggestionLabelByMode: Record<AiSuggestionMode, string> = { off: "Thủ công", manual: "Thủ công", on_open: "Khi mở hội thoại", on_customer_message: "Khi khách nhắn tin" };
const sentimentWindowByLabel: Record<string, AiSentimentWindow> = { "3 tin gần nhất": 3, "6 tin gần nhất": 6, "10 tin gần nhất": 10 };
const sentimentLabelByWindow: Record<AiSentimentWindow, string> = { 3: "3 tin gần nhất", 6: "6 tin gần nhất", 10: "10 tin gần nhất" };
const pickerColors = ["#9ca3af", "#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6", "#3b82f6", "#8b5cf6", "#ec4899", "#38bdf8"];
const settingsMenuItems = [
  { item: "Giới thiệu", isComingSoon: false },
  { item: "Cài đặt chung", isComingSoon: false },
  { item: "Thẻ hội thoại", isComingSoon: false },
  { item: "Trợ lý AI", isComingSoon: false },
  { item: "Hỗ trợ trả lời", isComingSoon: true },
  { item: "Giao diện", isComingSoon: true },
  { item: "Phân quyền", isComingSoon: true },
  { item: "Lịch sử", isComingSoon: false }
] as const;
const settingsItems = settingsMenuItems.map(({ item }) => item);
export const mobileSettingsItems = ["Giới thiệu", "Cài đặt chung", "Trợ lý AI", "Giao diện"] as const;
const settingsIconByItem = {
  "Cài đặt chung": "settings",
  "Thẻ hội thoại": "tag",
  "Trợ lý AI": "sparkles",
  "Hỗ trợ trả lời": "chat",
  "Giao diện": "monitor",
  // "Cuộc gọi": "phone",
  // "Chế độ xoay vòng": "refresh",
  // "Đồng bộ": "cloud",
  // "Công cụ": "wrench",
  "Phân quyền": "users",
  "Lịch sử": "clock",
  "Giới thiệu": "info"
} as const;
type SettingsItem = typeof settingsMenuItems[number]["item"];
const placeholderSettingsItems = new Set<SettingsItem>([
  "Hỗ trợ trả lời",
  "Giao diện",
  "Cuộc gọi",
  "Chế độ xoay vòng",
  "Đồng bộ",
  "Công cụ",
  "Phân quyền"
]);

export function isSettingsPlaceholderTab(item: SettingsItem): boolean {
  return placeholderSettingsItems.has(item);
}

const settingsSlugByItem: Record<SettingsItem, string> = {
  "Cài đặt chung": "general",
  "Thẻ hội thoại": "conversation-tags",
  "Trợ lý AI": "ai-assistant",
  "Hỗ trợ trả lời": "quick-replies",
  "Giao diện": "appearance",
  "Cuộc gọi": "calls",
  "Chế độ xoay vòng": "rotation",
  "Đồng bộ": "sync",
  "Công cụ": "tools",
  "Phân quyền": "permissions",
  "Lịch sử": "history",
  "Giới thiệu": "about"
};
const settingsItemBySlug = Object.fromEntries(Object.entries(settingsSlugByItem).map(([item, slug]) => [slug, item])) as Record<string, SettingsItem>;

export function settingsPathForItem(item: SettingsItem): string {
  return `/settings/${settingsSlugByItem[item]}`;
}

export function settingsItemFromPath(pathname: string): SettingsItem {
  return settingsItemBySlug[pathname.replace(/^\/settings\/?/, "")] ?? settingsItems[0] as SettingsItem;
}

export function publicationButtonLabel(enabled: boolean): { button: string; status: string } {
  return enabled
    ? { button: "Gỡ xuất bản", status: "Đang hoạt động" }
    : { button: "Xuất bản", status: "Chưa hoạt động" };
}

type AiAssistantTab = "Gợi ý trả lời" | "Chatbot tự động";

const aboutSections = ["Tổng quan", "Dashboard", "Đa tài khoản", "Quản lý tin nhắn", "Đăng bài", "Trợ lý AI", "Bảo mật & dữ liệu"] as const;
export const mobileAboutSections = aboutSections;
type AboutSection = typeof aboutSections[number];
const aboutSlugBySection: Record<AboutSection, string> = {
  "Tổng quan": "overview",
  Dashboard: "dashboard",
  "Đa tài khoản": "multi-account",
  "Quản lý tin nhắn": "message-management",
  "Đăng bài": "publishing",
  "Trợ lý AI": "ai-assistant",
  "Bảo mật & dữ liệu": "security-data"
};
const aboutSectionBySlug = Object.fromEntries(Object.entries(aboutSlugBySection).map(([section, slug]) => [slug, section])) as Record<string, AboutSection>;
type AboutSectionContextValue = {
  activeSection: AboutSection;
  onSectionChange: (section: AboutSection) => void;
};
const AboutSectionContext = React.createContext<AboutSectionContextValue>({ activeSection: aboutSections[0], onSectionChange: () => undefined });

export function aboutPathForSection(section: AboutSection): string {
  return `/settings/about/${aboutSlugBySection[section]}`;
}

export function aboutSectionFromPath(pathname: string): AboutSection {
  const slug = pathname.replace(/^\/settings\/about\/?/, "").split("/")[0];
  return aboutSectionBySlug[slug] ?? aboutSections[0];
}

const aboutSectionContent: Record<AboutSection, { summary: string; bullets: string[] }> = {
  "Tổng quan": {
    summary: "Nhuu-chat là hệ thống quản lý chăm sóc khách hàng đa kênh, kết hợp Inbox realtime với trợ lý AI RAG.",
    bullets: ["Thẻ tài khoản: Mỗi tài khoản hiển thị avatar, tên, trạng thái Online/Offline.", "Kiến trúc tách rõ xác thực, kênh kết nối, khách hàng, hội thoại, tin nhắn và AI.", "Giao diện tập trung vào trạng thái vận hành rõ ràng và không làm mất ngữ cảnh hội thoại."]
  },
  Dashboard: {
    summary: "Dashboard là trang chủ khi mở app, hiển thị trạng thái tất cả tài khoản và các thao tác quản lý nhanh: kết nối, ngắt kết nối, gộp trang và quản trị tài khoản.",
    bullets: ["Hiển thị các tài khoản/kênh đã kết nối cùng trạng thái hoạt động.", "Kết nối lại: Nhấn nút kết nối trên thẻ để reconnect khi listener bị ngắt", "Gộp trang: Nhấn \"Gộp tài khoản\" để xem hội thoại từ nhiều kênh trong một inbox duy nhất", "Trạng thái tài khoản: Theo dõi nhanh kết nối, listener và khả năng thao tác của từng tài khoản", "Tìm kiếm: Tìm tài khoản theo tên, ID"]
  },
  "Đa tài khoản": {
    summary: "Nhuu-Chat cho phép bạn đăng nhập và quản lý không giới hạn tài khoản trong một giao diện duy nhất. Mỗi tài khoản hoạt động độc lập, an toàn và không ảnh hưởng lẫn nhau.",
    bullets: ["Thêm tài khoản Nhấn nút \"Kết nối\" ở sidebar → chọn kênh và quét QR Code bằng ứng dụng trên điện thoại.","Phiên đăng nhập được duy trì Sau khi đăng nhập, phiên được lưu bảo mật trên máy cục bộ, không cần xác thực lại lần sau.", "Chuyển đổi tức thì Nhấp vào avatar tài khoản ở sidebar để chuyển đổi giữa các tài khoản không cần đăng xuất.", "Giám sát trạng thái Dashboard hiển thị trạng thái Online/Offline, listener sống/chết của từng tài khoản."]
  },
  "Quản lý tin nhắn": {
    summary: "Toàn bộ hội thoại từ tất cả tài khoản các kênh hiển thị trong một màn hình duy nhất. Hệ thống bộ lọc giúp bạn tập trung vào đúng hội thoại cần xử lý ngay lập tức",
    bullets: [
      "Hỗ trợ tin text, ảnh và file theo khả năng của từng kênh.",
      "Bộ lọc hội thoại: Tất cả · Theo nhãn", "Tìm kiếm thông minh: Tìm theo tên, hoặc nhập số điện thoại để tra cứu",
      "Ghim hội thoại: Ghim các hội thoại quan trọng lên đầu danh sách", "Chuyển hội thoại: Chuyển hội thoại sang tài khoản khác để xử lý", "Xem chi tiết hội thoại: Xem thông tin khách hàng, lịch sử hội thoại, nhãn và các thao tác quản lý"]
  },
  "Đăng bài": {
    summary: "Đăng bài lên Facebook Page từ Nhuu-chat với quy trình tạo, lên lịch và theo dõi trạng thái bài viết.",
    bullets: [
      "Mở Bài viết để bắt đầu tạo bài.",
      "Chọn Page Facebook muốn đăng.",
      "Nhập nội dung bài viết.",
      "Chọn Đăng ngay hoặc Hẹn đăng (Lên lịch).",
      "Theo dõi các trạng thái: Bản nháp, Đã hẹn, Đang đăng, Đã đăng, Thất bại.",
      "Chọn Thử lại khi bài viết đăng thất bại."
    ]
  },
  "Trợ lý AI": {
    summary: "Trợ lý AI - Tăng tốc chăm sóc khách hàng hỗ trợ gợi ý trả lời và chatbot tự động dựa trên cấu hình từng trợ lý.",
    bullets: ["Trợ lý AI trong Nhuu-chat cho phép bạn tạo nhiều chatbot AI với tính cách, prompt và mục đích khác nhau. Mỗi trợ lý có thể được gán cho một hội thoại cụ thể hoặc dùng trong Workflow để tự động trả lời tin nhắn.", "Hỗ trợ các mức model Gemini, gợi ý trả lời và chế độ kích hoạt theo hội thoại.", "RAG sử dụng tài liệu kiến thức để giữ câu trả lời theo dữ liệu của doanh nghiệp.", "Có phân tích cảm xúc và cơ chế handoff để nhân viên tiếp quản khi cần."]
  },
  "Bảo mật & dữ liệu": {
    summary: "Hệ thống ưu tiên phân quyền, cô lập dữ liệu và bảo vệ thông tin kết nối.",
    bullets: ["API yêu cầu xác thực và kiểm tra quyền truy cập theo owner/hội thoại.", "Credentials kênh cá nhân được lưu dưới dạng mã hóa.", "MongoDB lưu dữ liệu nghiệp vụ; Redis hỗ trợ lease và trạng thái realtime, còn media được lưu qua Cloudinary khi cấu hình."]
  }
};

const multiAccountSteps = [
  "Nhấn nút Kết nối ở sidebar, chọn kênh cần dùng và bắt đầu đăng nhập.",
  "Quét QR Code bằng ứng dụng trên điện thoại để xác thực tài khoản.",
  "Phiên đăng nhập được lưu bảo mật ở backend, không cần xác thực lại sau mỗi lần mở ứng dụng.",
  "Nhấp vào tài khoản ở sidebar để chuyển đổi giữa các tài khoản mà không cần đăng xuất.",
  "Theo dõi trạng thái Online/Offline và listener của từng tài khoản trên Dashboard."
];

const mergedPageSteps = [
  "Từ Dashboard, nhấn Gộp trang để mở modal Chọn pages để chat.",
  "Tìm kiếm và chọn từng Page/tài khoản muốn quản lý chung; có thể chọn tất cả Page đang hiển thị.",
  "Xác nhận lựa chọn để mở Inbox hợp nhất, nơi tin nhắn từ nhiều nguồn được quản lý trong một màn hình.",
  "Trong chế độ này, hội thoại vẫn giữ thông tin kênh và tài khoản gốc để nhân viên xử lý đúng ngữ cảnh."
];

const mergedPageNotes = [
  "Tài khoản Zalo phải là tài khoản cá nhân hoặc tài khoản doanh nghiệp hợp lệ",
  "App không hỗ trợ tài khoản đã bị Zalo khóa hoặc giới hạn tính năng",
  "Đăng nhập thông qua QR Code - ứng dụng không lưu mật khẩu Zalo",
  "Tài khoản đã bị ngắt kết nối (cookie hết hạn) sẽ không tự động gọi lên Zalo - cần kết nối lại thủ công hoặc quét QR mới",
  "Với chế độ Gộp trang: chỉ gộp các tài khoản đang online để đảm bảo nhận tin nhắn đầy đủ"
];

const overviewAudience = [
  "Đội ngũ chăm sóc khách hàng cần quản lý Facebook, Instagram, Zalo và Telegram trong một nơi.",
  "Doanh nghiệp có nhiều tài khoản hoặc nhiều nhân viên cùng xử lý hội thoại.",
  "Người vận hành cần theo dõi trạng thái kết nối, tin nhắn và dữ liệu khách hàng rõ ràng."
];

const overviewFeatures = [
  "Inbox hợp nhất cho tin nhắn text, ảnh và file từ nhiều kênh.",
  "Quản lý riêng từng tài khoản, hội thoại, nhãn, người phụ trách và trạng thái gửi.",
  "Dashboard theo dõi tài khoản online/offline, listener và thao tác kết nối.",
  "Đăng bài hiện tại hỗ trợ đăng nội dung lên Facebook Page.",
  "Trợ lý AI, chatbot tự động và kho kiến thức RAG hỗ trợ phản hồi theo ngữ cảnh."
];

const aiAssistantSteps = [
  "Mở tab Trợ lý AI trong Cài đặt và chọn chatbot muốn cấu hình.",
  "Chọn model Gemini, bật/tắt trợ lý và điều chỉnh chế độ gợi ý trả lời hoặc phát hiện cảm xúc.",
  "Viết hướng dẫn, thêm tài liệu kiến thức và mẫu chào để chatbot hiểu sản phẩm, giá và chính sách.",
  "Dùng khung xem trước để kiểm tra câu trả lời, sau đó bấm Xuất bản khi nội dung đã phù hợp.",
  "Theo dõi hội thoại thực tế và để nhân viên tiếp quản khi AI không đủ thông tin."
];

type ChatbotAssistant = Pick<AssistantContract, "id" | "name" | "instructions" | "modelTier" | "enabled" | "fallbackMessage" | "channelScope" | "isDefault">;
type GreetingTemplateDraft = Pick<AutomationTemplateContract, "name" | "keywords" | "responseTemplate" | "allowAiRewrite" | "priority" | "enabled" | "channelScope">;

const ASSISTANT_SELECTION_STORAGE_PREFIX = "nhuu-chat:selected-assistant:";

export function assistantSelectionStorageKey(ownerKey: string): string {
  return `${ASSISTANT_SELECTION_STORAGE_PREFIX}${ownerKey}`;
}

export function readPersistedAssistantId(ownerKey?: string): string | null {
  if (!ownerKey || typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(assistantSelectionStorageKey(ownerKey));
  } catch {
    return null;
  }
}

export function resolveInitialAssistantId(assistants: Array<Pick<ChatbotAssistant, "id" | "isDefault">>, persistedId: string | null): string | null {
  return assistants.find((assistant) => assistant.id === persistedId)?.id
    ?? assistants.find((assistant) => assistant.isDefault)?.id
    ?? assistants[0]?.id
    ?? null;
}

type KnowledgeDocument = { id: string; title: string; sourceType: "text" | "file" | "url"; status: "pending" | "processing" | "ready" | "failed"; createdAt?: string };
type KnowledgeListResponse = { documents: Array<{ _id: string; title: string; sourceType: KnowledgeDocument["sourceType"]; status: KnowledgeDocument["status"]; createdAt?: string }> };

type SettingsDashboardAccount = {
  email: string;
  role: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string | null;
};

type SettingsDashboardTopbarProps = {
  onLogoClick?: () => void;
  onNavigate?: (item: "Hộp thư" | "Đơn hàng" | "Bài viết" | "Thống kê" | "Cài đặt") => void;
  user?: SettingsDashboardAccount | null;
  onLogout?: () => void;
  onProfile?: () => void;
  settingsSubmenuItems?: readonly SettingsItem[];
  activeSettingsSubmenuItem?: SettingsItem;
  onSettingsSubmenuNavigate?: (item: SettingsItem) => void;
  onAboutSectionNavigate?: (section: AboutSection) => void;
};

function SettingsDashboardTopbar({ onAboutSectionNavigate, ...props }: SettingsDashboardTopbarProps) {
  return <DashboardTopbar {...(props as React.ComponentProps<typeof DashboardTopbar>)} nestedSettingsSubmenuItems={{ "Giới thiệu": mobileAboutSections }} onNestedSettingsSubmenuNavigate={(item) => onAboutSectionNavigate?.(item as AboutSection)} />;
}

function AiToggle({ checked, label, onChange }: { checked: boolean; label: string; onChange: (value: boolean) => void }) {
  return <button className={`relative inline-flex h-6 w-11 shrink-0 items-center justify-start border-0 p-0 rounded-full transition-colors ${checked ? "bg-blue-600" : "bg-gray-300"} cursor-pointer transition-opacity hover:opacity-80`} type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}><span className={`absolute left-1 top-1 size-4 rounded-full bg-white shadow-sm transition-transform ${checked ? "translate-x-5" : "translate-x-0"}`} /></button>;
}

function AiSelect({ value, options, label, onChange }: { value: string; options: string[]; label: string; onChange: (value: string) => void }) {
  return <select className="w-full min-w-0 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100 md:w-auto" aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option}>{option}</option>)}</select>;
}

function AiSettingItem({ icon, iconClassName, title, description, children, footer }: { icon: "sparkles" | "cloud" | "chat" | "smile"; iconClassName: string; title: string; description: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode }) {
  return <article className="flex flex-col items-start gap-4 border-b border-gray-100 py-5 last:border-b-0 md:flex-row"><span className={`grid size-11 shrink-0 place-items-center rounded-full ${iconClassName}`}><InboxIcon name={icon} size={20} /></span><div className="w-full min-w-0 flex-1"><h3 className="break-words whitespace-normal font-semibold text-gray-900">{title}</h3><div className="mt-1 max-w-2xl break-words whitespace-normal text-sm leading-6 text-gray-500">{description}</div>{footer && <div className="mt-3 break-words whitespace-normal">{footer}</div>}</div><div className="flex w-full min-w-0 flex-col items-stretch gap-3 md:w-auto md:shrink-0 md:flex-row md:flex-wrap md:items-center md:justify-end">{children}</div></article>;
}

function KnowledgeDocumentModal({ token, refresh, onClose }: { token: string; refresh?: () => Promise<string | null>; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const filteredDocuments = documents.filter((document) => document.title.toLowerCase().includes(query.toLowerCase()));

  async function loadKnowledgeDocuments() {
    setIsLoading(true);
    try {
      const result = await apiRequest<KnowledgeListResponse>(API_URL, "/api/v1/knowledge", token, {}, refresh);
      setDocuments(result.documents.map((document) => ({ id: document._id, title: document.title, sourceType: document.sourceType, status: document.status, createdAt: document.createdAt })));
      setError(null);
    } catch {
      setError("Không thể tải danh sách tài liệu kiến thức");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadKnowledgeDocuments();
  }, [refresh, token]);

  async function addKnowledgeFile(file: File) {
    if (!/\.(txt|md)$/i.test(file.name)) {
      setError("Chỉ hỗ trợ file .txt hoặc .md");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const content = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
        reader.onerror = () => reject(new Error("FILE_READ_FAILED"));
        reader.readAsText(file);
      });
      if (!content.trim()) throw new Error("EMPTY_FILE");
      await apiRequest(API_URL, "/api/v1/knowledge", token, { method: "POST", body: JSON.stringify({ title: file.name, content, sourceType: "file" }) }, refresh);
      await loadKnowledgeDocuments();
    } catch {
      setError("Không thể thêm tài liệu kiến thức");
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteKnowledgeDocument(document: KnowledgeDocument) {
    if (!window.confirm(`Xóa tài liệu "${document.title}"?`)) return;
    try {
      await apiRequest<void>(API_URL, `/api/v1/knowledge/${document.id}`, token, { method: "DELETE" }, refresh);
      setDocuments((current) => current.filter((item) => item.id !== document.id));
    } catch {
      setError("Không thể xóa tài liệu kiến thức");
    }
  }

  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4 backdrop-blur-sm" role="presentation" onMouseDown={onClose}>
    <section className="w-full max-w-lg animate-[composer-dialog-in_180ms_ease-out] rounded-xl bg-white p-5 shadow-xl sm:p-6" role="dialog" aria-modal="true" aria-labelledby="knowledge-modal-title" onMouseDown={(event) => event.stopPropagation()}>
      <header className="flex items-start justify-between gap-4"><div><h3 className="text-lg font-bold text-gray-900" id="knowledge-modal-title">Tài liệu kiến thức</h3><p className="mt-1 text-xs text-gray-500">Chỉ hỗ trợ .txt và .md</p></div><div className="flex items-center gap-3"><label className="cursor-pointer text-sm font-semiboldtext-gray-900  hover:underline">Thêm tài liệu<input className="sr-only" type="file" accept=".txt,.md,text/plain,text/markdown" disabled={isSaving} onChange={(event) => { const file = event.target.files?.[0]; if (file) void addKnowledgeFile(file); event.target.value = ""; }} /></label><button className="grid size-8 place-items-center rounded-lg text-gray-500 hover:bg-gray-100 cursor-pointer" type="button" aria-label="Đóng" onClick={onClose}><InboxIcon name="close" size={17} /></button></div></header>
      <label className="mt-5 flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-400"><InboxIcon name="search" size={16} /><input className="min-w-0 flex-1 text-gray-700 outline-none placeholder:text-gray-400" placeholder="Tìm kiếm" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      {error && <p className="mt-3 text-sm text-rose-600" role="alert">{error}</p>}
      <div className="mt-4 max-h-64 space-y-2 overflow-y-auto">{isLoading ? <p className="py-8 text-center text-sm text-gray-500">Đang tải tài liệu...</p> : filteredDocuments.map((document) => <div className="flex items-center gap-3 rounded-lg p-2 hover:bg-gray-50" key={document.id}><span className="grid size-10 shrink-0 place-items-center rounded-lg bg-gray-100 text-gray-500"><InboxIcon name="file" size={18} /></span><span className="min-w-0 flex-1"><strong className="block truncate text-sm text-gray-900">{document.title}</strong><small className="text-xs text-gray-500">{document.status === "ready" ? "Đã sẵn sàng" : "Đang xử lý"}</small></span><button className="grid size-8 shrink-0 place-items-center rounded-lg text-gray-400 hover:bg-rose-50 hover:text-rose-600 cursor-pointer" type="button" aria-label={`Xóa tài liệu ${document.title}`} onClick={() => void deleteKnowledgeDocument(document)}><InboxIcon name="trash" size={15} /></button></div>)}{!isLoading && filteredDocuments.length === 0 && <p className="py-8 text-center text-sm text-gray-500">Chưa có tài liệu kiến thức</p>}</div>
    </section>
  </div>;
}

function AssistantNameModal({ name, onNameChange, onClose, onSubmit }: { name: string; onNameChange: (name: string) => void; onClose: () => void; onSubmit: () => void }) {
  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4 backdrop-blur-sm" role="presentation" onMouseDown={onClose}>
    <section className="w-full max-w-md animate-[composer-dialog-in_180ms_ease-out] rounded-xl bg-white p-5 shadow-xl sm:p-6" role="dialog" aria-modal="true" aria-labelledby="assistant-name-title" onMouseDown={(event) => event.stopPropagation()}>
      <div className="flex items-center justify-between gap-4"><h3 className="text-lg font-bold text-gray-900" id="assistant-name-title">Tạo chatbot mới</h3><button className="grid size-8 place-items-center rounded-lg text-gray-500 hover:bg-gray-100 cursor-pointer" type="button" aria-label="Đóng" onClick={onClose}><InboxIcon name="close" size={17} /></button></div>
      <label className="mt-5 grid gap-1.5 text-sm font-semibold text-gray-700">Tên trợ lý<input autoFocus className="rounded-lg border border-gray-200 px-3 py-2.5 font-normal outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100" placeholder="Nhập tên trợ lý" value={name} onChange={(event) => onNameChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); onSubmit(); } }} /></label>
      <div className="mt-5 flex justify-end gap-2"><button className="rounded-lg px-4 py-2 text-sm font-semibold text-gray-500 hover:bg-gray-50 cursor-pointer" type="button" onClick={onClose}>Hủy</button><button className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer" type="button" disabled={!name.trim()} onClick={onSubmit}>Tạo chatbot</button></div>
    </section>
  </div>;
}

function GreetingTemplateModal({ template, isSaving, onClose, onSave }: { template: AutomationTemplateContract | null; isSaving: boolean; onClose: () => void; onSave: (draft: GreetingTemplateDraft) => Promise<void> }) {
  const [name, setName] = useState(template?.name ?? "");
  const [keywords, setKeywords] = useState(template?.keywords.join(", ") ?? "");
  const [responseTemplate, setResponseTemplate] = useState(template?.responseTemplate ?? "");
  const [enabled, setEnabled] = useState(template?.enabled ?? true);
  const [allowAiRewrite, setAllowAiRewrite] = useState(template?.allowAiRewrite ?? false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedKeywords = keywords.split(",").map((keyword) => keyword.trim()).filter(Boolean);
    if (!name.trim() || parsedKeywords.length === 0 || !responseTemplate.trim()) return;
    await onSave({
      name: name.trim(),
      keywords: parsedKeywords,
      responseTemplate: responseTemplate.trim(),
      allowAiRewrite,
      priority: template?.priority ?? 100,
      enabled,
      channelScope: template?.channelScope ?? { mode: "all", identifiers: [] }
    });
  }

  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4" role="presentation" onMouseDown={onClose}><section className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="greeting-template-title" onMouseDown={(event) => event.stopPropagation()}><div className="flex items-center justify-between gap-4"><h3 className="text-lg font-bold text-gray-900" id="greeting-template-title">{template ? "Sửa mẫu chào" : "Thêm mẫu chào"}</h3><button className="cursor-pointer transition-opacity hover:opacity-80" type="button" aria-label="Đóng" onClick={onClose}><InboxIcon name="close" /></button></div><form className="mt-5 grid gap-4" onSubmit={(event) => void submit(event)}><label className="grid gap-1.5 text-sm font-semibold text-gray-700">Tên mẫu<input className="rounded-lg border border-gray-200 px-3 py-2.5 font-normal" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ví dụ: Chào khách hàng" /></label><label className="grid gap-1.5 text-sm font-semibold text-gray-700">Từ khóa<input className="rounded-lg border border-gray-200 px-3 py-2.5 font-normal" value={keywords} onChange={(event) => setKeywords(event.target.value)} placeholder="hi, hello, xin chào" /><small className="font-normal text-gray-400">Ngăn cách các từ khóa bằng dấu phẩy</small></label><label className="grid gap-1.5 text-sm font-semibold text-gray-700">Nội dung trả lời<textarea className="min-h-28 rounded-lg border border-gray-200 px-3 py-2.5 font-normal" value={responseTemplate} onChange={(event) => setResponseTemplate(event.target.value)} /></label><label className="flex items-center gap-2 text-sm font-semibold text-gray-700"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /> Đang bật</label><label className="flex items-center gap-2 text-sm font-semibold text-gray-700"><input type="checkbox" checked={allowAiRewrite} onChange={(event) => setAllowAiRewrite(event.target.checked)} /> Cho phép Gemini viết lại <small className="font-normal text-gray-400">(tắt để trả lời ngay)</small></label><div className="flex justify-end gap-2"><button className="rounded-lg px-4 py-2 text-sm font-semibold text-gray-500 cursor-pointer transition-opacity hover:opacity-80" type="button" onClick={onClose}>Hủy</button><button className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed" type="submit" disabled={isSaving}>{isSaving ? "Đang lưu..." : "Lưu mẫu"}</button></div></form></section></div>;
}

function ChatbotAutomationSettingsLegacy({ token, refresh }: { token: string; refresh?: () => Promise<string | null> }) {
  const [assistants, setAssistants] = useState<Array<{ id: number; name: string }>>([{ id: 1, name: "Trợ lý mặc định" }, { id: 2, name: "bán hàng 1" }]);
  const [selectedAssistant, setSelectedAssistant] = useState("Trợ lý mặc định");
  const [isCreateAssistantModalOpen, setIsCreateAssistantModalOpen] = useState(false);
  const [newAssistantName, setNewAssistantName] = useState("");
  const [isKnowledgeModalOpen, setIsKnowledgeModalOpen] = useState(false);
  const [isModelOpen, setIsModelOpen] = useState(true);
  const [isKnowledgeOpen, setIsKnowledgeOpen] = useState(true);
  const [draft, setDraft] = useState("");
  const [isAssistantMenuOpen, setIsAssistantMenuOpen] = useState(false);
  const selected = assistants.find((assistant) => assistant.name === selectedAssistant) ?? assistants[0];

  function deleteAssistant(id: number) {
    const deleted = assistants.find((assistant) => assistant.id === id);
    const next = assistants.filter((assistant) => assistant.id !== id);
    setAssistants(next);
    if (deleted?.name === selectedAssistant) setSelectedAssistant(next[0]?.name ?? "");
  }

  function createAssistant() {
    const name = newAssistantName.trim();
    if (!name) return;
    const id = Math.max(0, ...assistants.map((assistant) => assistant.id)) + 1;
    const assistant = { id, name };
    setAssistants((current) => [...current, assistant]);
    setSelectedAssistant(assistant.name);
    setNewAssistantName("");
    setIsCreateAssistantModalOpen(false);
  }

  function openCreateAssistantModal() {
    setNewAssistantName("");
    setIsAssistantMenuOpen(false);
    setIsCreateAssistantModalOpen(true);
  }

  function closeCreateAssistantModal() {
    setNewAssistantName("");
    setIsCreateAssistantModalOpen(false);
  }

  return <div className="mt-5">
    <header className="flex items-center justify-between gap-4 px-1 pb-3"><div className="relative"><button className="flex items-center gap-1.5 text-left cursor-pointer transition-opacity hover:opacity-80" type="button" aria-label="Mở danh sách trợ lý" aria-expanded={isAssistantMenuOpen} onClick={() => setIsAssistantMenuOpen((current) => !current)}><span><strong className="block text-sm font-bold text-gray-900">{selected?.name ?? "Trợ lý mặc định"}</strong><small className="mt-1 block text-xs text-gray-400">Áp dụng cho Page: <strong className="font-semiboldtext-gray-900 ">Nguyễn Ngọc Hữu</strong></small></span><InboxIcon name="chevron-down" size={15} /></button>{isAssistantMenuOpen && <div className="absolute left-0 top-full z-20 mt-2 w-64 rounded-xl border border-gray-200 bg-white p-2 shadow-lg" aria-label="Danh sách trợ lý"><div className="mb-1 flex items-center justify-between px-2 py-1"><span className="text-xs font-bold text-gray-500">Trợ lý</span><button className="grid size-7 place-items-center rounded-mdtext-gray-900  hover:text-gray-900  cursor-pointer" type="button" aria-label="Tạo chatbot mới" onClick={openCreateAssistantModal}><InboxIcon name="plus" size={16} /></button></div><div className="grid gap-1">{assistants.map((assistant) => <div className={`group flex items-center gap-2 rounded-lg px-2 py-2 ${selectedAssistant === assistant.name ? "text-gray-900  font-semibold text-gray-900" : "text-gray-600 hover:bg-gray-50"}`} key={assistant.id}><button className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm cursor-pointer transition-opacity hover:opacity-80" type="button" onClick={() => { setSelectedAssistant(assistant.name); setIsAssistantMenuOpen(false); }}><InboxIcon name="robot" size={15} /><span className="min-w-0 flex-1 truncate">{assistant.name}</span></button><button className="invisible grid size-7 shrink-0 place-items-center rounded text-rose-500 hover:bg-rose-50 group-hover:visible focus:visible cursor-pointer" type="button" aria-label={`Xóa ${assistant.name}`} onClick={() => deleteAssistant(assistant.id)}><InboxIcon name="trash" size={14} /></button></div>)}</div></div>}</div><div className="flex items-center gap-2"><button className="rounded-full border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 cursor-pointer" type="button" onClick={openCreateAssistantModal}>Chat mới</button><button className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 cursor-pointer" type="button">Xuất bản</button></div></header>
    <div className="grid min-h-[520px] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm lg:grid-cols-[minmax(300px,1fr)_minmax(250px,0.9fr)_minmax(300px,1fr)] max-[1024px]:grid-cols-1">
      <section className="flex min-h-[420px] flex-col border-r border-gray-200 max-[1024px]:border-r-0 max-[1024px]:border-b" aria-label="Hướng dẫn"><div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3"><h3 className="text-sm font-bold text-gray-900">Hướng dẫn</h3><div className="flex items-center gap-3 text-xs font-semibold"><button className="text-gray-400 hover:text-gray-700 cursor-pointer" type="button">Xem mẫu</button><button className="text-gray-400 hover:text-gray-700 cursor-pointer" type="button">AI rules</button><button className="inline-flex items-center gap-1text-gray-900  hover:text-gray-900 cursor-pointer" type="button"><InboxIcon name="sparkles" size={14} /> Viết lại</button></div></div><textarea className="min-h-56 flex-1 resize-y border-0 px-4 py-3 text-sm leading-6 text-gray-700 outline-none focus:ring-2 focus:ring-inset focus:ring-sky-100" aria-label="Nội dung hướng dẫn" defaultValue={"## Nhân vật\nBạn là 1 chuyên gia bán hàng quần áo\n\n### Kỹ năng\n- Bạn có kỹ năng tư vấn sản phẩm nữ\n- Bạn có kỹ năng tư vấn tình cảm\n\n### Giới hạn\n- Giữ kết luận trong khoảng 100 từ\n- Cung cấp thông tin chính xác và tin cậy"} /></section>
      <section className="min-h-[420px] border-r border-gray-200 p-4 max-[1024px]:border-r-0 max-[1024px]:border-b" aria-label="Cấu hình chatbot"><div className="border-b border-gray-100 pb-4"><button className="flex w-full items-center justify-between text-sm font-bold text-gray-800 cursor-pointer transition-opacity hover:opacity-80" type="button" onClick={() => setIsModelOpen((current) => !current)}><span className="flex items-center gap-2"><InboxIcon name="chevron-down" size={16} /> Model</span></button>{isModelOpen && <select className="mt-3 w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100" aria-label="Model chatbot" defaultValue="Gemini 2.5 Flash"><option>Gemini 2.5 Flash</option></select>}</div><div className="pt-4"><div className="flex items-center justify-between"><button className="flex items-center gap-2 text-sm font-bold text-gray-800 cursor-pointer transition-opacity hover:opacity-80" type="button" onClick={() => setIsKnowledgeOpen((current) => !current)}><InboxIcon name="chevron-down" size={16} /> Kiến thức</button><button className="grid size-8 place-items-center rounded-lg text-gray-500 hover:bg-gray-100 cursor-pointer" type="button" aria-label="Chọn tài liệu kiến thức" onClick={() => setIsKnowledgeModalOpen(true)}><InboxIcon name="file" size={17} /></button></div>{isKnowledgeOpen && <div className="mt-3 grid gap-2"><button className="flex items-center gap-2 rounded-lg bg-gray-50 px-2.5 py-2 text-left text-xs text-gray-600 hover:text-gray-900  hover:text-gray-900 cursor-pointer" type="button" onClick={() => setIsKnowledgeModalOpen(true)}><InboxIcon name="file" size={15} /> impl.txt</button><p className="text-xs text-gray-400">Tài liệu giúp chatbot trả lời đúng ngữ cảnh.</p></div>}</div></section>
      <section className="flex min-h-[420px] flex-col overflow-hidden bg-gray-50/40" aria-label="Khung Chat"><header className="border-b border-gray-100 px-4 py-3 text-center"><span className="text-sm font-bold text-gray-900" aria-label="Tên trợ lý hiện tại">{selected?.name ?? "Trợ lý mặc định"}</span></header><div className="grid flex-1 place-items-center p-6 text-center"><div><span className="mx-auto grid size-16 place-items-center rounded-full text-gray-900 0 text-white shadow-sm"><InboxIcon name="robot" size={30} /></span><h3 className="mt-4 font-bold text-gray-900">{selected?.name ?? "Trợ lý mặc định"}</h3><p className="mt-1 text-sm text-gray-500">Tư vấn khách hàng</p></div></div><form className="flex items-center gap-2 border-t border-gray-100 bg-white p-3" onSubmit={(event) => { event.preventDefault(); setDraft(""); }}><input className="min-w-0 flex-1 rounded-full border border-gray-200 px-4 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100" placeholder="Gửi tin nhắn" value={draft} onChange={(event) => setDraft(event.target.value)} /><button className="grid size-9 shrink-0 place-items-center rounded-lg text-blue-600 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer" type="submit" aria-label="Gửi tin nhắn" disabled={!draft.trim()}><InboxIcon name="send" size={19} /></button></form></section>
    </div>
    {isKnowledgeModalOpen && <KnowledgeDocumentModal token={token} refresh={refresh} onClose={() => setIsKnowledgeModalOpen(false)} />}
    {isCreateAssistantModalOpen && <AssistantNameModal name={newAssistantName} onNameChange={setNewAssistantName} onClose={closeCreateAssistantModal} onSubmit={createAssistant} />}
  </div>;
}

function ChatbotAutomationSettings({ token, refresh, ownerKey }: { token: string; refresh?: () => Promise<string | null>; ownerKey?: string }) {
  const [assistants, setAssistants] = useState<ChatbotAssistant[]>([]);
  const [selectedAssistantId, setSelectedAssistantId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<Array<{ role: "customer" | "bot"; content: string }>>([]);
  const [instructions, setInstructions] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isSavingAssistant, setIsSavingAssistant] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [modelTier, setModelTier] = useState<AiModelTier>("smart");
  const [isSavingModel, setIsSavingModel] = useState(false);
  const [isKnowledgeModalOpen, setIsKnowledgeModalOpen] = useState(false);
  const [templates, setTemplates] = useState<AutomationTemplateContract[]>([]);
  const [isTemplatesLoading, setIsTemplatesLoading] = useState(false);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<AutomationTemplateContract | null>(null);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [isAssistantMenuOpen, setIsAssistantMenuOpen] = useState(false);
  const [deletingAssistantId, setDeletingAssistantId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newAssistantName, setNewAssistantName] = useState("");
  const selected = assistants.find((assistant) => assistant.id === selectedAssistantId) ?? assistants[0];

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    void apiRequest<{ assistants: ChatbotAssistant[] }>(API_URL, ASSISTANTS_API_PATH, token, {}, refresh)
      .then(async (result) => {
        if (!active) return;
        let nextAssistants = result.assistants;
        if (nextAssistants.length === 0) {
          const created = await apiRequest<ChatbotAssistant>(API_URL, ASSISTANTS_API_PATH, token, {
            method: "POST",
            body: JSON.stringify({
              name: "Trợ lý mặc định",
              instructions: "Bạn là trợ lý tư vấn khách hàng. Hãy trả lời bằng tiếng Việt, lịch sự và chính xác.",
              isDefault: true
            })
          }, refresh);
          nextAssistants = [created];
        }
        if (!active) return;
        setAssistants(nextAssistants);
        const initialAssistantId = resolveInitialAssistantId(nextAssistants, readPersistedAssistantId(ownerKey));
        const initialAssistant = nextAssistants.find((assistant) => assistant.id === initialAssistantId) ?? nextAssistants[0];
        setSelectedAssistantId(initialAssistantId);
        setInstructions(initialAssistant?.instructions ?? "");
        setModelTier(initialAssistant?.modelTier ?? "smart");
      })
      .catch(() => { if (active) setError("Không thể tải danh sách trợ lý"); })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [ownerKey, refresh, token]);

  useEffect(() => {
    if (!ownerKey || !selectedAssistantId) return;
    try {
      window.localStorage.setItem(assistantSelectionStorageKey(ownerKey), selectedAssistantId);
    } catch {
      // Không làm hỏng màn hình trợ lý nếu trình duyệt chặn localStorage.
    }
  }, [ownerKey, selectedAssistantId]);

  async function loadTemplates(assistantId: string) {
    setIsTemplatesLoading(true);
    try {
      const result = await apiRequest<{ templates: AutomationTemplateContract[] }>(API_URL, `${ASSISTANTS_API_PATH}/${assistantId}/templates`, token, {}, refresh);
      setTemplates(result.templates);
    } catch {
      setError("Không thể tải danh sách mẫu chào");
    } finally {
      setIsTemplatesLoading(false);
    }
  }

  useEffect(() => {
    if (selected?.id) {
      setModelTier(selected.modelTier);
      void loadTemplates(selected.id);
    }
    else setTemplates([]);
  }, [selected?.id, refresh, token]);

  function openCreateTemplate() { setEditingTemplate(null); setIsTemplateModalOpen(true); }
  function openEditTemplate(template: AutomationTemplateContract) { setEditingTemplate(template); setIsTemplateModalOpen(true); }

  async function saveTemplate(draft: GreetingTemplateDraft) {
    if (!selected) return;
    setIsSavingTemplate(true);
    try {
      const result = await apiRequest<AutomationTemplateContract>(API_URL, `${ASSISTANTS_API_PATH}/${selected.id}/templates${editingTemplate ? `/${editingTemplate.id}` : ""}`, token, {
        method: editingTemplate ? "PATCH" : "POST",
        body: JSON.stringify({ ...draft, assistantId: selected.id })
      }, refresh);
      setTemplates((current) => editingTemplate ? current.map((template) => template.id === result.id ? result : template) : [...current, result]);
      setIsTemplateModalOpen(false);
      setEditingTemplate(null);
    } catch {
      setError(editingTemplate ? "Không thể sửa mẫu chào" : "Không thể thêm mẫu chào");
    } finally {
      setIsSavingTemplate(false);
    }
  }

  async function importTemplates(rows: AutomationTemplateImportRow[]) {
    if (!selected) return;
    setIsSavingTemplate(true);
    try {
      const result = await apiRequest<{ imported: number; templates: AutomationTemplateContract[] }>(API_URL, `${ASSISTANTS_API_PATH}/${selected.id}/templates/import`, token, {
        method: "POST",
        body: JSON.stringify({ templates: rows })
      }, refresh);
      setTemplates((current) => [...current, ...result.templates]);
      setIsImportModalOpen(false);
    } catch {
      setError("Không thể import kịch bản");
    } finally {
      setIsSavingTemplate(false);
    }
  }

  async function deleteTemplate(template: AutomationTemplateContract) {
    if (!window.confirm(`Xóa mẫu chào "${template.name}"?`)) return;
    try {
      await apiRequest<void>(API_URL, `${ASSISTANTS_API_PATH}/${selected?.id}/templates/${template.id}`, token, { method: "DELETE" }, refresh);
      setTemplates((current) => current.filter((item) => item.id !== template.id));
    } catch {
      setError("Không thể xóa mẫu chào");
    }
  }

  async function sendPreview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || !selected || isSending) return;
    const history = messages.slice(-20);
    setMessages((current) => [...current, { role: "customer", content }]);
    setDraft("");
    setIsSending(true);
    setError(null);
    try {
      const result = await apiRequest<BotPreviewResponse>(API_URL, `${ASSISTANTS_API_PATH}/${selected.id}/preview`, token, {
        method: "POST",
        body: JSON.stringify({ message: content, history })
      }, refresh);
      setMessages((current) => [...current, { role: "bot", content: result.answer }]);
    } catch {
      setError("Không thể gửi tin nhắn thử nghiệm");
    } finally {
      setIsSending(false);
    }
  }

  async function createAssistant() {
    const name = newAssistantName.trim();
    if (!name) return;
    setError(null);
    try {
      const assistant = await apiRequest<ChatbotAssistant>(API_URL, ASSISTANTS_API_PATH, token, {
        method: "POST",
        body: JSON.stringify({ name, instructions: "Bạn là trợ lý tư vấn khách hàng. Hãy trả lời bằng tiếng Việt, lịch sự và chính xác." })
      }, refresh);
      setAssistants((current) => [...current, assistant]);
      setSelectedAssistantId(assistant.id);
      setNewAssistantName("");
      setIsCreateOpen(false);
    } catch {
      setError("Không thể tạo trợ lý");
    }
  }

  // Xóa chatbot qua API rồi chuyển giao diện sang trợ lý mặc định hoặc bot còn lại.
  async function deleteAssistant(assistant: ChatbotAssistant) {
    if (!window.confirm(`Xóa chatbot "${assistant.name}"?`)) return;
    setDeletingAssistantId(assistant.id);
    setError(null);
    try {
      await apiRequest<void>(API_URL, `${ASSISTANTS_API_PATH}/${assistant.id}`, token, { method: "DELETE" }, refresh);
      const nextAssistants = assistants.filter((item) => item.id !== assistant.id);
      const nextSelected = nextAssistants.find((item) => item.isDefault) ?? nextAssistants[0];
      setAssistants(nextAssistants);
      setSelectedAssistantId(nextSelected?.id ?? null);
      setInstructions(nextSelected?.instructions ?? "");
      setModelTier(nextSelected?.modelTier ?? "smart");
      setMessages([]);
      setIsAssistantMenuOpen(false);
    } catch {
      setError("Không thể xóa chatbot");
    } finally {
      setDeletingAssistantId(null);
    }
  }

  function selectAssistant(assistant: ChatbotAssistant) {
    setSelectedAssistantId(assistant.id);
    setInstructions(assistant.instructions);
    setModelTier(assistant.modelTier);
    setMessages([]);
    setIsAssistantMenuOpen(false);
  }

  async function saveAssistant() {
    if (!selected || isSavingAssistant) return;
    setIsSavingAssistant(true);
    setError(null);
    try {
      const saved = await apiRequest<ChatbotAssistant>(API_URL, `${ASSISTANTS_API_PATH}/${selected.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({ instructions })
      }, refresh);
      setAssistants((current) => current.map((assistant) => assistant.id === saved.id ? saved : assistant));
      setInstructions(saved.instructions);
    } catch {
      setError("Không thể lưu hướng dẫn trợ lý");
    } finally {
      setIsSavingAssistant(false);
    }
  }

  async function togglePublication() {
    if (!selected || isPublishing) return;
    setIsPublishing(true);
    setError(null);
    try {
      const updated = await apiRequest<ChatbotAssistant>(API_URL, `${ASSISTANTS_API_PATH}/${selected.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !selected.enabled })
      }, refresh);
      setAssistants((current) => current.map((assistant) => assistant.id === updated.id ? updated : assistant));
    } catch {
      setError("Không thể thay đổi trạng thái trả lời tự động");
    } finally {
      setIsPublishing(false);
    }
  }

  async function saveModelTier(modelTier: AiModelTier) {
    if (!selected || isSavingModel) return;
    setModelTier(modelTier);
    setIsSavingModel(true);
    setError(null);
    try {
      const saved = await apiRequest<ChatbotAssistant>(API_URL, `${ASSISTANTS_API_PATH}/${selected.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({ modelTier })
      }, refresh);
      setAssistants((current) => current.map((assistant) => assistant.id === saved.id ? saved : assistant));
      setModelTier(saved.modelTier);
    } catch {
      setModelTier(selected.modelTier);
      setError("Không thể lưu model chatbot");
    } finally {
      setIsSavingModel(false);
    }
  }

  return <div className="mt-5">
    {error && <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">{error}</p>}
    <header className="flex flex-col items-stretch gap-4 px-1 pb-4 md:flex-row md:items-center md:justify-between"><div className="relative w-full min-w-0 md:w-auto"><button className="flex w-full min-w-0 items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 md:w-auto cursor-pointer" type="button" aria-label="Mở danh sách chatbot" aria-expanded={isAssistantMenuOpen} onClick={() => setIsAssistantMenuOpen((current) => !current)}><span className="min-w-0"><strong className="block break-words whitespace-normal text-sm font-bold text-gray-900">{selected?.name ?? "Trợ lý mặc định"}</strong><small className="mt-1 block break-words whitespace-normal text-xs text-gray-400">{selected?.isDefault ? "Trợ lý mặc định" : "Chatbot theo chủ đề"} · Tư vấn khách hàng</small></span><InboxIcon name="chevron-down" size={15} /></button>{isAssistantMenuOpen && <div className="absolute left-0 top-full z-30 mt-2 w-full min-w-0 rounded-xl border border-gray-200 bg-white p-2 shadow-lg md:w-72" role="menu" aria-label="Danh sách chatbot"><div className="px-2 py-1.5 text-xs font-bold text-gray-500">Chọn chatbot</div>{isLoading ? <p className="px-2 py-3 text-xs text-gray-400">Đang tải chatbot...</p> : assistants.length === 0 ? <p className="px-2 py-3 text-xs text-gray-400">Chưa có chatbot</p> : <div className="grid gap-1">{assistants.map((assistant) => <div className={`group flex items-center gap-2 rounded-lg px-2 py-2 ${selected?.id === assistant.id ? "text-gray-900  text-gray-900" : "text-gray-600 hover:bg-gray-50"}`} key={assistant.id} role="none"><button className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm cursor-pointer transition-opacity hover:opacity-80" type="button" role="menuitem" onClick={() => selectAssistant(assistant)}><InboxIcon name="robot" size={15} /><span className="min-w-0 flex-1 break-words whitespace-normal">{assistant.name}</span></button><button className="grid size-7 shrink-0 place-items-center rounded text-rose-500 opacity-0 transition hover:bg-rose-50 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-rose-500 group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer" type="button" role="menuitem" aria-label={`Xóa chatbot ${assistant.name}`} disabled={deletingAssistantId === assistant.id} onClick={(event) => { event.stopPropagation(); void deleteAssistant(assistant); }}><InboxIcon name="trash" size={14} /></button></div>)}</div>}<button className="mt-2 flex w-full items-center gap-2 border-t border-gray-100 px-2 py-2.5 text-left text-sm font-semiboldtext-gray-900  hover:text-gray-900  cursor-pointer" type="button" role="menuitem" onClick={() => { setIsAssistantMenuOpen(false); setNewAssistantName(""); setIsCreateOpen(true); }}><InboxIcon name="plus" size={15} /> Tạo chatbot mới</button></div>}</div><div className="flex w-full flex-col items-stretch gap-2 sm:flex-row md:w-auto md:items-center"> <button className="w-full rounded-full border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 sm:w-auto cursor-pointer" type="button" aria-label="Xóa nội dung chat thử nghiệm" onClick={() => { setMessages([]); setError(null); }}>Chat mới</button>{selected && <span className={selected.enabled ? "w-full rounded-full bg-emerald-50 px-3 py-2 text-center text-xs font-bold text-emerald-700 sm:w-auto" : "w-full rounded-full bg-gray-100 px-3 py-2 text-center text-xs font-bold text-gray-500 sm:w-auto"} role="status">{publicationButtonLabel(selected.enabled).status}</span>}<button className={selected?.enabled ? "w-full rounded-full border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-700 shadow-sm hover:bg-rose-50 disabled:opacity-60 sm:w-auto cursor-pointer disabled:cursor-not-allowed" : "w-full rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60 sm:w-auto cursor-pointer disabled:cursor-not-allowed"} type="button" aria-label={selected?.enabled ? "Gỡ xuất bản chatbot" : "Xuất bản chatbot"} disabled={!selected || isPublishing} onClick={() => void togglePublication()}>{isPublishing ? "Đang lưu..." : publicationButtonLabel(selected?.enabled ?? false).button}</button></div></header>
    <div className="grid min-h-[520px] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm lg:grid-cols-[minmax(300px,1fr)_minmax(250px,0.9fr)_minmax(300px,1fr)] max-[1024px]:grid-cols-1">
      <section className="flex min-h-[420px] min-w-0 flex-col border-r border-gray-200 p-4 max-[1024px]:border-r-0 max-[1024px]:border-b" aria-label="Hướng dẫn"><div className="flex flex-col items-start gap-3 border-b border-gray-100 pb-3 md:flex-row md:items-center md:justify-between"><h3 className="text-sm font-bold text-gray-900">Hướng dẫn</h3><button className="w-full rounded-md border border-sky-200 px-3 py-1.5 text-xs font-semibold text-gray-900 hover:text-gray-900  disabled:opacity-50 md:ml-auto md:w-auto md:shrink-0 cursor-pointer disabled:cursor-not-allowed" type="button" onClick={() => void saveAssistant()} disabled={!selected || isSavingAssistant}>{isSavingAssistant ? "Đang lưu..." : "Lưu hướng dẫn"}</button></div><textarea className="min-h-56 w-full min-w-0 flex-1 resize-y border-0 px-1 py-3 text-sm leading-6 text-gray-700 outline-none" aria-label="Nội dung hướng dẫn" value={instructions} onChange={(event) => setInstructions(event.target.value)} /></section>
      <section className="min-h-[420px] min-w-0 border-r border-gray-200 p-4 max-[1024px]:border-r-0 max-[1024px]:border-b" aria-label="Cấu hình chatbot"><div className="flex flex-col items-start gap-3 border-b border-gray-100 pb-3 md:flex-row md:justify-between"><h3 className="text-sm font-bold text-gray-800 md:pt-2">Model</h3><div className="flex w-full min-w-0 flex-col items-start gap-1 md:w-auto md:items-end"><select className="w-full max-w-full rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-sm font-semibold text-gray-700 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 disabled:opacity-60 md:w-auto" aria-label="Model chatbot" value={modelTier} onChange={(event) => void saveModelTier(event.target.value as AiModelTier)} disabled={!selected || isSavingModel}><option value="smart">Thông minh nhất</option><option value="balanced">Cân bằng</option><option value="economy">Tiết kiệm</option></select><small className="max-w-full break-words whitespace-normal text-[11px] text-gray-400" title={modelNameByTier[modelTier]}>Model đang sử dụng: {modelNameByTier[modelTier]}</small></div></div><div className="mt-6 flex flex-col items-start gap-3 border-b border-gray-100 pb-3 md:flex-row md:items-center md:justify-between"><h3 className="text-sm font-bold text-gray-800">Kiến thức</h3><button className="w-full rounded-md px-2 py-1 text-left text-xs font-semiboldtext-gray-900  hover:text-gray-900  md:w-auto md:text-center cursor-pointer" type="button" onClick={() => setIsKnowledgeModalOpen(true)}>Quản lý tài liệu</button></div>
      <p className="mt-3 break-words whitespace-normal text-xs text-gray-400">Thêm menu, giá, topping và chính sách để AI tư vấn chính xác.</p>
      <div className="mt-6 flex flex-col items-start gap-3 border-b border-gray-100 pb-3 md:flex-row md:items-center md:justify-between"><h3 className="text-sm font-bold text-gray-800">Mẫu chào</h3><div className="flex w-full flex-col items-stretch gap-2 sm:flex-row md:w-auto md:shrink-0 md:items-center"><button className="w-full rounded-md px-2 py-1 text-xs font-semiboldtext-gray-900  hover:text-gray-900  disabled:opacity-50 sm:w-auto cursor-pointer disabled:cursor-not-allowed" type="button" onClick={openCreateTemplate} disabled={!selected}>+ Thêm mẫu chào</button><button className="w-full rounded-md border border-sky-200 px-3 py-1.5 text-xs font-semibold text-gray-900 hover:text-gray-900  disabled:opacity-50 sm:w-auto cursor-pointer disabled:cursor-not-allowed" type="button" onClick={() => setIsImportModalOpen(true)} disabled={!selected}>Import kịch bản</button></div></div>{isTemplatesLoading ? <p className="mt-3 text-xs text-gray-400">Đang tải mẫu chào...</p> : <div className="mt-3 grid gap-2">{templates.map((template) => <div className="min-w-0 rounded-lg bg-gray-50 px-2.5 py-2" key={template.id}><div className="flex items-start justify-between gap-2"><div className="min-w-0 flex-1"><strong className="block break-words whitespace-normal text-xs text-gray-700">{template.name}</strong><small className="block break-words whitespace-normal text-[11px] text-gray-400">{template.keywords.join(", ")}</small></div><div className="flex shrink-0 gap-1"><button className="cursor-pointer transition-opacity hover:opacity-80" type="button" aria-label={`Sửa mẫu chào ${template.name}`} onClick={() => openEditTemplate(template)}><InboxIcon name="edit" size={13} /></button><button className="cursor-pointer transition-opacity hover:opacity-80" type="button" aria-label={`Xóa mẫu chào ${template.name}`} onClick={() => void deleteTemplate(template)}><InboxIcon name="trash" size={13} /></button></div></div></div>)}{templates.length === 0 && <p className="text-xs text-gray-400">Chưa có mẫu chào</p>}</div>}<p className="mt-6 break-words whitespace-normal text-xs text-gray-400">Kiến thức được quản lý trong mục Kiến thức.</p></section>
      <section className="flex min-h-[420px] min-w-0 flex-col overflow-hidden bg-gray-50/40" aria-label="Khung Chat"><header className="border-b border-gray-100 px-4 py-3 text-center"><span className="break-words whitespace-normal text-sm font-bold text-gray-900" aria-label="Tên trợ lý hiện tại">{selected?.name ?? "Chưa có trợ lý"}</span></header><div className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6">{isLoading ? <p className="text-center text-sm text-gray-500">Đang tải trợ lý...</p> : !selected ? <div className="grid h-full place-items-center text-center"><p className="break-words whitespace-normal text-sm text-gray-500">Chưa có trợ lý. Hãy bấm “Chat mới” để tạo.</p></div> : messages.length === 0 ? <div className="grid h-full place-items-center text-center"><div className="min-w-0"><span className="mx-auto grid size-16 place-items-center rounded-full text-gray-900 0 text-white shadow-sm"><InboxIcon name="robot" size={30} /></span><h3 className="mt-4 break-words whitespace-normal font-bold text-gray-900">{selected.name}</h3><p className="mt-1 text-sm text-gray-500">Tư vấn khách hàng</p></div></div> : <div className="grid min-w-0 gap-3">{messages.map((message, index) => <div className={`max-w-[85%] break-words whitespace-normal rounded-2xl px-4 py-2.5 text-sm leading-6 ${message.role === "customer" ? "ml-auto bg-blue-600 text-white" : "bg-white text-gray-700 shadow-sm"}`} key={`${message.role}-${index}`}>{message.content}</div>)}{isSending && <p className="text-xs text-gray-400">Đang trả lời...</p>}</div>}</div><form className="flex items-center gap-2 border-t border-gray-100 bg-white p-3" onSubmit={(event) => void sendPreview(event)}><input className="min-w-0 flex-1 rounded-full border border-gray-200 px-4 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100" placeholder="Gửi tin nhắn" value={draft} onChange={(event) => setDraft(event.target.value)} disabled={!selected || isSending} /><button className="grid size-9 shrink-0 place-items-center rounded-lg text-blue-600 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer" type="submit" aria-label="Gửi tin nhắn" disabled={!draft.trim() || !selected || isSending}><InboxIcon name="send" size={19} /></button></form></section>
    </div>
    {isCreateOpen && <AssistantNameModal name={newAssistantName} onNameChange={setNewAssistantName} onClose={() => setIsCreateOpen(false)} onSubmit={() => void createAssistant()} />}
    {isTemplateModalOpen && <GreetingTemplateModal template={editingTemplate} isSaving={isSavingTemplate} onClose={() => { setIsTemplateModalOpen(false); setEditingTemplate(null); }} onSave={saveTemplate} />}
    {isImportModalOpen && <AutomationTemplateImportModal isSaving={isSavingTemplate} onClose={() => setIsImportModalOpen(false)} onImport={importTemplates} />}
    {isKnowledgeModalOpen && <KnowledgeDocumentModal token={token} refresh={refresh} onClose={() => setIsKnowledgeModalOpen(false)} />}
  </div>;
}

function AiAssistantSettings({ token, refresh, ownerKey }: { token: string; refresh?: () => Promise<string | null>; ownerKey?: string }) {
  const [activeAiTab, setActiveAiTab] = useState<AiAssistantTab>("Gợi ý trả lời");
  const [model, setModel] = useState("Thông minh nhất");
  const [modelEnabled, setModelEnabled] = useState(true);
  const [wallet, setWallet] = useState("Test WA $62.18");
  const [suggestionTiming, setSuggestionTiming] = useState("Khi mở hội thoại");
  const [suggestionsEnabled, setSuggestionsEnabled] = useState(true);
  const [sentimentMessages, setSentimentMessages] = useState("3 tin gần nhất");
  const [sentimentEnabled, setSentimentEnabled] = useState(true);
  const [aiSettings, setAiSettings] = useState<AiSettingsContract>(DEFAULT_AI_SETTINGS);

  useEffect(() => {
    let active = true;
    void apiRequest<AiSettingsContract>(API_URL, AI_SETTINGS_API_PATH, token, {}, refresh).then((settings) => {
      if (!active) return;
      setAiSettings(settings);
      setModel(modelLabelByTier[settings.modelTier]);
      setModelEnabled(settings.enabled);
      setSuggestionsEnabled(settings.suggestionsEnabled);
      setSuggestionTiming(suggestionLabelByMode[settings.suggestionMode]);
      setSentimentMessages(sentimentLabelByWindow[settings.sentimentWindow]);
      setSentimentEnabled(settings.sentimentEnabled);
    });
    return () => { active = false; };
  }, [refresh, token]);

  async function onSettingsChange(patch: Partial<AiSettingsContract>) {
    const next = { ...aiSettings, ...patch };
    setAiSettings(next);
    try {
      const saved = await apiRequest<AiSettingsContract>(API_URL, AI_SETTINGS_API_PATH, token, { method: "PATCH", body: JSON.stringify(patch) }, refresh);
      setAiSettings(saved);
    } catch {
      // Keep the local control responsive when the settings request is temporarily unavailable.
    }
  }

  return <div className="min-w-0 rounded-2xl bg-white p-4 shadow-sm sm:p-7"><div className="flex flex-wrap items-center justify-between gap-4"><h2 className="break-words whitespace-normal text-2xl font-bold text-gray-900">Trợ lý AI</h2><span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-700">Beta</span></div><div className="mt-6 flex gap-2 overflow-x-auto border-b border-gray-100 pb-3"><button className={`shrink-0 rounded-lg px-4 py-2 text-sm font-semibold transition ${activeAiTab === "Gợi ý trả lời" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"} cursor-pointer`} type="button" onClick={() => setActiveAiTab("Gợi ý trả lời")}>Gợi ý trả lời</button><button className={`shrink-0 rounded-lg px-4 py-2 text-sm font-semibold transition ${activeAiTab === "Chatbot tự động" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"} cursor-pointer`} type="button" onClick={() => setActiveAiTab("Chatbot tự động")}>Chatbot tự động</button></div>{activeAiTab === "Gợi ý trả lời" ? <div><AiSettingItem icon="sparkles" iconClassName="bg-purple-50 text-purple-600" title="Mô hình AI" description="NHuuChat cung cấp 3 tuỳ chọn AI khác nhau. Model thông minh nhất, chi phí sẽ cao hơn nhưng chất lượng sẽ tốt nhất."><AiSelect label="Mô hình AI" value={model} options={["Thông minh nhất", "Cân bằng", "Tiết kiệm"]} onChange={(value) => { setModel(value); void onSettingsChange({ modelTier: modelTierByLabel[value] }); }} /><AiToggle checked={modelEnabled} label="Bật mô hình AI" onChange={(value) => { setModelEnabled(value); void onSettingsChange({ enabled: value }); }} /></AiSettingItem><AiSettingItem icon="cloud" iconClassName="text-gray-900  text-sky-500" title="Thanh toán" description={<>Phí sử dụng tính năng AI sẽ được trừ trực tiếp từ ví Pancake bạn chọn. Hãy nạp tiền vào ví để đảm bảo dịch vụ không bị gián đoạn. <button className="font-semiboldtext-gray-900  hover:underline sm:ml-1 cursor-pointer" type="button">Nạp tiền</button></>}><AiSelect label="Ví thanh toán" value={wallet} options={["Test WA $62.18"]} onChange={setWallet} /></AiSettingItem><AiSettingItem icon="chat" iconClassName="bg-amber-50 text-amber-500" title="Gợi ý trả lời tin nhắn từ AI" description={<>Tự động hiển thị <strong>3 câu gợi ý</strong> trả lời tin nhắn dựa trên nội dung cuộc trò chuyện gần nhất giúp bạn phản hồi nhanh hơn.</>} footer={<button className="text-sm font-semiboldtext-gray-900  hover:underline cursor-pointer" type="button">Tuỳ chỉnh</button>}><AiSelect label="Thời điểm gợi ý" value={suggestionTiming} options={["Khi mở hội thoại", "Khi khách nhắn tin", "Luôn gợi ý", "Thủ công"]} onChange={(value) => { setSuggestionTiming(value); void onSettingsChange({ suggestionMode: suggestionModeByLabel[value] }); }} /><AiToggle checked={suggestionsEnabled} label="Bật gợi ý trả lời" onChange={(value) => { setSuggestionsEnabled(value); void onSettingsChange({ suggestionsEnabled: value }); }} /></AiSettingItem><AiSettingItem icon="smile" iconClassName="bg-emerald-50 text-emerald-600" title="Phát hiện cảm xúc của khách hàng" description="Tự động phân tích và hiển thị sắc thái cảm xúc khách hàng trong cuộc trò chuyện. Tăng độ chính xác bằng cách cho AI truy cập nhiều tin nhắn cũ hơn." footer={<div className="grid min-w-0 gap-1 break-words whitespace-normal text-sm text-gray-500"><span>Khi khách hàng <strong>Không hài lòng</strong> hoặc <strong>giận dữ</strong>, <strong>tiêu cực</strong>:</span><span>Khi phát hiện, tự động</span><span className="mt-1 inline-flex w-fit items-center gap-1 rounded-full text-gray-900  px-2 py-1 text-xs font-semibold text-gray-900">AI Sentiment <button className="cursor-pointer transition-opacity hover:opacity-80" type="button" aria-label="Xóa AI Sentiment"><InboxIcon name="close" size={13} /></button></span></div>}><AiSelect label="Số tin nhắn cảm xúc" value={sentimentMessages} options={["3 tin gần nhất", "6 tin gần nhất", "10 tin gần nhất"]} onChange={(value) => { setSentimentMessages(value); void onSettingsChange({ sentimentWindow: sentimentWindowByLabel[value] }); }} /><AiToggle checked={sentimentEnabled} label="Bật phát hiện cảm xúc" onChange={(value) => { setSentimentEnabled(value); void onSettingsChange({ sentimentEnabled: value }); }} /></AiSettingItem></div> : <ChatbotAutomationSettings token={token} refresh={refresh} ownerKey={ownerKey} />}</div>;
}

type QuickReplyDraft = Pick<QuickReplyContract, "shortcut" | "message"> & { attachment?: File };

function QuickReplyModal({ reply, isSaving, error, onClose, onSave }: { reply: QuickReplyContract | null; isSaving: boolean; error: string | null; onClose: () => void; onSave: (reply: QuickReplyDraft) => Promise<boolean> }) {
  const [shortcut, setShortcut] = useState(reply?.shortcut ?? "");
  const [message, setMessage] = useState(reply?.message ?? "");
  const [attachment, setAttachment] = useState<File | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextShortcut = shortcut.trim();
    const nextMessage = message.trim();
    if (!nextShortcut || !nextMessage) return;
    const saved = await onSave({ shortcut: nextShortcut, message: nextMessage, ...(attachment ? { attachment } : {}) });
    if (saved) setAttachment(null);
  }

  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4 backdrop-blur-sm" role="presentation" onMouseDown={onClose}>
    <section className="w-full max-w-lg animate-[composer-dialog-in_180ms_ease-out] rounded-2xl bg-white p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="quick-reply-title" onMouseDown={(event) => event.stopPropagation()}>
      <div className="flex items-center justify-between gap-4"><h3 className="text-lg font-bold text-gray-900" id="quick-reply-title">{reply ? "Sửa mẫu trả lời nhanh" : "Thêm mẫu trả lời nhanh"}</h3><button className="grid size-8 place-items-center rounded-lg text-gray-500 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer" type="button" onClick={onClose} aria-label="Đóng" disabled={isSaving}><InboxIcon name="close" /></button></div>
      <form className="mt-6 grid gap-5" onSubmit={submit}>
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">{error}</p>}
        <label className="grid gap-2 text-sm font-semibold text-gray-800">Ký tự tắt<input className="rounded-lg border border-gray-300 px-3 py-2.5 font-normal outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500" placeholder="Vd: cskh" value={shortcut} onChange={(event) => setShortcut(event.target.value)} /></label>
        <label className="grid gap-2 text-sm font-semibold text-gray-800">Tin nhắn<textarea className="min-h-28 resize-y rounded-lg border border-gray-300 px-3 py-2.5 font-normal outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500" placeholder="Nội dung sẽ được chèn khi gõ ký tự tắt ở trên" value={message} onChange={(event) => setMessage(event.target.value)} /></label>
        <div className="grid gap-2 text-sm font-semibold text-gray-800"><span>Ảnh đính kèm</span><label className="flex cursor-pointer items-center gap-2 rounded-lg border-2 border-dashed border-gray-300 px-3 py-3 text-left font-normal text-gray-600 transition hover:border-blue-400 hover:text-blue-600" htmlFor="quick-reply-attachment"><InboxIcon name="image" size={18} /> {attachment ? attachment.name : "Chọn ảnh từ thư viện"}</label><input className="sr-only" id="quick-reply-attachment" type="file" accept="image/*" disabled={isSaving} onChange={(event) => setAttachment(event.target.files?.[0] ?? null)} />{attachment && <button className="w-fit text-xs font-semibold text-gray-500 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer" type="button" disabled={isSaving} onClick={() => setAttachment(null)}>Xoá ảnh đính kèm</button>}</div>
        <div className="mt-1 flex justify-end gap-2"><button className="rounded-lg px-4 py-2 text-sm font-semibold text-gray-500 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer" type="button" onClick={onClose} disabled={isSaving}>Huỷ</button><button className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer" type="submit" disabled={isSaving}>{isSaving ? "Đang lưu..." : "Lưu"}</button></div>
      </form>
    </section>
  </div>;
}

// Vô hiệu hóa GET cũ qua mỗi lần ghi và chỉ đồng bộ lại sau khi mọi thao tác ghi kết thúc.
export function createQuickReplySync(callbacks: {
  setReplies: (replies: QuickReplyContract[]) => void;
  setLoading: (loading: boolean) => void;
  setLoadError: (message: string | null, background: boolean) => void;
}) {
  let generation = 0;
  let scope = 0;
  let pendingMutations = 0;

  async function load(fetchReplies: () => Promise<QuickReplyContract[]>, background = false) {
    if (pendingMutations > 0) return;
    const current = ++generation;
    callbacks.setLoadError(null, background);
    if (!background) callbacks.setLoading(true);
    try {
      const replies = await fetchReplies();
      if (current === generation) callbacks.setReplies(replies);
    } catch {
      if (current === generation) callbacks.setLoadError("Không thể tải danh sách trả lời nhanh", background);
    } finally {
      if (current === generation && !background) callbacks.setLoading(false);
    }
  }

  async function mutate<T>(write: () => Promise<T>, apply: (result: T) => void, fetchReplies: () => Promise<QuickReplyContract[]>) {
    const currentScope = scope;
    ++generation;
    ++pendingMutations;
    callbacks.setLoading(false);
    callbacks.setLoadError(null, false);
    try {
      const result = await write();
      if (currentScope !== scope) return false;
      apply(result);
      return true;
    } finally {
      if (currentScope === scope) {
        ++generation;
        --pendingMutations;
        if (pendingMutations === 0) void load(fetchReplies, true);
      }
    }
  }

  function invalidate() {
    ++generation;
    ++scope;
    pendingMutations = 0;
  }

  return { load, mutate, invalidate };
}

function QuickReplySettings({ token, refresh }: { token: string; refresh?: () => Promise<string | null> }) {
  const [quickReplies, setQuickReplies] = useState<QuickReplyContract[]>([]);
  const [search, setSearch] = useState("");
  const [isAddQuickReplyModalOpen, setIsAddQuickReplyModalOpen] = useState(false);
  const [editingQuickReply, setEditingQuickReply] = useState<QuickReplyContract | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [quickReplySync] = useState(() => createQuickReplySync({
    setReplies: setQuickReplies,
    setLoading: setIsLoading,
    setLoadError: (message, background) => background ? setActionError(message) : setPageError(message)
  }));
  const filteredReplies = quickReplies.filter((reply) => `${reply.shortcut} ${reply.message}`.toLowerCase().includes(search.toLowerCase()));

  async function fetchQuickReplies() {
    const result = await apiRequest<{ quickReplies: QuickReplyContract[] }>(API_URL, QUICK_REPLIES_API_PATH, token, { method: "GET" }, refresh);
    return result.quickReplies;
  }

  function loadQuickReplies() { return quickReplySync.load(fetchQuickReplies); }

  useEffect(() => {
    void loadQuickReplies();
    return quickReplySync.invalidate;
  }, [refresh, token]);

  function closeQuickReplyModal() { setIsAddQuickReplyModalOpen(false); setEditingQuickReply(null); }
  function openAddQuickReplyModal() { setEditingQuickReply(null); setModalError(null); setIsAddQuickReplyModalOpen(true); }
  function openEditQuickReplyModal(reply: QuickReplyContract) { setEditingQuickReply(reply); setModalError(null); setIsAddQuickReplyModalOpen(true); }

  async function saveQuickReply(reply: QuickReplyDraft) {
    const formData = new FormData();
    formData.append("shortcut", reply.shortcut);
    formData.append("message", reply.message);
    if (reply.attachment) formData.append("attachment", reply.attachment);
    setIsSaving(true);
    setModalError(null);
    try {
      return await quickReplySync.mutate(
        () => apiRequest<QuickReplyContract>(API_URL, editingQuickReply ? `${QUICK_REPLIES_API_PATH}/${editingQuickReply.id}` : QUICK_REPLIES_API_PATH, token, { method: editingQuickReply ? "PATCH" : "POST", body: formData }, refresh),
        (saved) => {
          setQuickReplies((current) => editingQuickReply ? current.map((item) => item.id === saved.id ? saved : item) : [...current, saved]);
          closeQuickReplyModal();
        },
        fetchQuickReplies
      );
    } catch {
      setModalError(reply.attachment ? "Không thể tải ảnh đính kèm" : editingQuickReply ? "Không thể cập nhật mẫu trả lời nhanh" : "Không thể thêm mẫu trả lời nhanh");
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  async function removeQuickReply(reply: QuickReplyContract) {
    if (!window.confirm(`Xóa mẫu trả lời nhanh "${reply.shortcut}"?`)) return;
    setDeletingId(reply.id);
    setActionError(null);
    try {
      await quickReplySync.mutate(
        () => apiRequest<void>(API_URL, `${QUICK_REPLIES_API_PATH}/${reply.id}`, token, { method: "DELETE" }, refresh),
        () => setQuickReplies((current) => current.filter((item) => item.id !== reply.id)),
        fetchQuickReplies
      );
    } catch {
      setActionError("Không thể xóa mẫu trả lời nhanh");
    } finally {
      setDeletingId(null);
    }
  }

  return <div className="rounded-2xl bg-white p-5 shadow-sm sm:p-7">
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100"><div className="border-b-2 border-blue-500 pb-3 text-sm font-semibold text-blue-600">Trả lời nhanh</div><div className="mb-3 flex flex-wrap items-center justify-end gap-2"><div className="flex gap-1 rounded-lg bg-gray-50 p-1">{[{ icon: "check" as const, label: "Chọn tất cả" }, { icon: "download" as const, label: "Xuất" }, { icon: "upload" as const, label: "Nhập" }, { icon: "file" as const, label: "Tệp" }].map((action) => <button className="grid size-8 place-items-center rounded-md text-gray-500 transition hover:bg-white hover:text-blue-600 cursor-pointer" type="button" aria-label={action.label} title={action.label} key={action.label}><InboxIcon name={action.icon} size={16} /></button>)}</div><button className="rounded-lg bg-blue-500 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer" type="button" onClick={openAddQuickReplyModal} disabled={isSaving}>Thêm mẫu</button></div></div>
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3"><h3 className="text-base font-semibold text-gray-900">Danh sách trả lời nhanh</h3><label className="flex w-full max-w-xs items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-400"><InboxIcon name="search" size={16} /><input className="min-w-0 flex-1 text-gray-700 outline-none placeholder:text-gray-400" placeholder="Tìm kiếm tin nhắn" value={search} onChange={(event) => setSearch(event.target.value)} /></label></div>
    {actionError && <p className="mt-4 text-sm text-rose-600" role="alert">{actionError}</p>}
    {pageError ? <p className="mt-7 text-sm text-rose-600" role="alert">{pageError}</p> : isLoading ? <p className="mt-7 text-sm text-gray-500">Đang tải mẫu trả lời nhanh...</p> : <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[640px] border-collapse text-left text-sm"><thead><tr className="border-y border-gray-100 text-xs uppercase tracking-wide text-gray-500"><th className="w-16 px-3 py-3 font-semibold">STT</th><th className="w-40 px-3 py-3 font-semibold">Ký tự tắt</th><th className="px-3 py-3 font-semibold">Tin nhắn</th><th className="w-24 px-3 py-3 font-semibold">Ảnh</th><th className="w-24 px-3 py-3 font-semibold">Thao tác</th></tr></thead><tbody>{filteredReplies.map((reply, index) => <tr className="border-b border-gray-100 text-gray-700" key={reply.id}><td className="px-3 py-4 text-gray-400">{index + 1}</td><td className="px-3 py-4 font-semibold text-gray-900">{reply.shortcut}</td><td className="px-3 py-4">{reply.message}</td><td className="px-3 py-4">{reply.attachment && <a className="inline-flex cursor-pointer transition-opacity hover:opacity-80" href={reply.attachment.secureUrl} target="_blank" rel="noreferrer"><img className="size-10 rounded-md object-cover" src={reply.attachment.secureUrl} alt="Ảnh đính kèm của mẫu trả lời nhanh" /></a>}</td><td className="px-3 py-4"><div className="flex gap-1"><button className="grid size-8 place-items-center rounded-md text-gray-500 hover:text-gray-900  hover:text-sky-600 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer" type="button" aria-label={`Sửa ${reply.shortcut}`} onClick={() => openEditQuickReplyModal(reply)} disabled={isSaving || deletingId === reply.id}><InboxIcon name="edit" size={15} /></button><button className="grid size-8 place-items-center rounded-md text-gray-500 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer" type="button" aria-label={`Xóa ${reply.shortcut}`} onClick={() => void removeQuickReply(reply)} disabled={isSaving || deletingId === reply.id}><InboxIcon name="trash" size={15} /></button></div></td></tr>)}{filteredReplies.length === 0 && <tr><td className="px-3 py-8 text-center text-gray-500" colSpan={5}>{quickReplies.length === 0 ? "Chưa có mẫu trả lời nhanh" : "Không tìm thấy tin nhắn"}</td></tr>}</tbody></table></div>}
    {isAddQuickReplyModalOpen && <QuickReplyModal reply={editingQuickReply} isSaving={isSaving} error={modalError} onClose={closeQuickReplyModal} onSave={saveQuickReply} />}
  </div>;
}

interface SettingsPageProps {
  token: string;
  refresh: () => Promise<string | null>;
  onLogoClick?: () => void;
  onNavigate?: (item: "Hộp thư" | "Đơn hàng" | "Bài viết" | "Thống kê" | "Cài đặt") => void;
  user?: SettingsDashboardAccount | null;
  onLogout?: () => void;
  onProfile?: () => void;
}

type AboutIconName = "user" | "layers" | "alert" | "users" | "sparkles" | "note" | "shield";

function AboutInfoBlock({ title, icon, items, numbered = false }: { title: string; icon: AboutIconName; items: string[]; numbered?: boolean }) {
  return <section className="mt-8 first:mt-0" aria-labelledby={`about-${icon}-title`}>
    <h3 className="flex items-center gap-3 text-xl font-bold text-gray-900" id={`about-${icon}-title`}><span className="text-blue-600"><InboxIcon name={icon} size={22} /></span>{title}</h3>
    <ul className={numbered ? "mt-5 list-none p-0" : "mt-5 list-disc pl-5"}>
      {items.map((item, index) => numbered
        ? <li className="flex gap-4 mb-4" key={item}><span className="flex h-6 w-6 mb-3 text-xs shrink-0 items-center justify-center rounded-full bg-blue-100 font-bold text-blue-600">{index + 1}</span><span className="text-sm leading-6 text-gray-700">{item}</span></li>
        : <li className="mb-3 text-xs leading-6 text-gray-700" key={item}>{item}</li>)}
    </ul>
  </section>;
}

function AboutBulletGroup({ title, icon, items }: { title: string; icon: AboutIconName; items: string[] }) {
  return <section className="mt-8 first:mt-0" aria-labelledby={`about-${icon}-${title}`}>
    <h3 className="flex items-center gap-3 text-xl font-bold text-gray-900" id={`about-${icon}-${title}`}><span className="text-blue-600"><InboxIcon name={icon} size={22} /></span>{title}</h3>
    <ul className="mt-5 list-disc ml-5 pl-2">
      {items.map((item) => <li className="mb-3 text-sm leading-6 text-gray-700" key={item}>{item}</li>)}
    </ul>
  </section>;
}

// Hiển thị hướng dẫn vận hành theo section, giữ riêng nội dung đa tài khoản và Gộp trang.
function AboutSettings() {
  const { activeSection, onSectionChange } = React.useContext(AboutSectionContext);
  const content = aboutSectionContent[activeSection];
  const desktopSections = aboutSections;

  return <div className="grid min-h-[520px] md:grid-cols-[minmax(170px,0.32fr)_minmax(0,1fr)]">
    <aside className="hidden border-r border-gray-100 bg-gray-50/70 p-4 md:block" aria-label="Điều hướng Giới thiệu: Tổng quan, Dashboard, Đa tài khoản, Quản lý tin nhắn, Đăng bài, Trợ lý AI, Bảo mật & dữ liệu">
      <nav className="grid gap-1">
        {desktopSections.map((section) => <button className={`rounded-lg px-3 py-2.5 text-left text-sm transition ${activeSection === section ? "bg-white font-semibold text-gray-900 shadow-sm" : "text-gray-600 hover:bg-white"} cursor-pointer`} type="button" key={section} onClick={() => onSectionChange(section)} aria-current={activeSection === section ? "page" : undefined}>{section}</button>)}
      </nav>
    </aside>
    <article className="p-6 sm:p-8" aria-label={`Nội dung ${activeSection}`}>
      <div className="min-h-[520px] max-w-3xl">
        {activeSection === "Tổng quan" ? <>
          <AboutBulletGroup title="Ứng dụng này được xây dựng dành cho ai?" icon="users" items={overviewAudience} />
          <AboutBulletGroup title="Tính năng nổi bật" icon="sparkles" items={overviewFeatures} />
        </> : activeSection === "Trợ lý AI" ? <>
          <AboutBulletGroup title="Tính năng Trợ lý AI" icon="sparkles" items={content.bullets} />
          <AboutInfoBlock title="Hướng dẫn sử dụng Trợ lý AI" icon="note" items={aiAssistantSteps} numbered />
        </> : activeSection === "Bảo mật & dữ liệu" ? <>
          <AboutBulletGroup title="Bảo mật & dữ liệu" icon="shield" items={content.bullets} />
        </> : activeSection === "Đa tài khoản" ? <>
          <AboutInfoBlock title="Đăng nhập nhiều tài khoản ở các kênh khác" icon="user" items={multiAccountSteps} numbered />
          <AboutInfoBlock title="Chế độ gộp trang" icon="layers" items={mergedPageSteps} />
          <section className="mt-8" aria-labelledby="about-important-notes">
            <h3 className="flex items-center gap-3 text-xl font-bold text-gray-900" id="about-important-notes"><span className="text-amber-500"><InboxIcon name="alert" size={22} /></span>Lưu ý quan trọng</h3>
            <ul className="mt-5 list-disc pl-5">{mergedPageNotes.map((note) => <li className="mb-3 text-sm leading-6 text-gray-700" key={note}>{note}</li>)}</ul>
          </section>
        </> : <>
          <h2 className="mt-4 text-2xl font-bold text-gray-900">{activeSection}</h2>
          <p className="mt-3 text-sm leading-7 text-gray-600">{content.summary}</p>
          <ul className="mt-6 grid gap-3">
            {content.bullets.map((bullet) => <li className="flex gap-3 text-sm leading-6 text-gray-700" key={bullet}><span className="mt-2 size-1 shrink-0 rounded-full bg-black" aria-hidden="true" /><span>{bullet}</span></li>)}
          </ul>
        </>}
      </div>
    </article>
  </div>;
}

function SettingsLayout({ activeTab, onTabChange, onAboutSectionChange, children, onLogoClick, onNavigate, user, onLogout, onProfile }: SettingsPageProps & { activeTab: SettingsItem; onTabChange: (item: SettingsItem) => void; onAboutSectionChange: (section: AboutSection) => void; children: React.ReactNode }) {
  function handleTabChange(item: SettingsItem) {
    if (isSettingsPlaceholderTab(item)) {
      toast.info(`${item}: Chức năng đang được phát triển`);
      return;
    }
    onTabChange(item);
  }
  return <main className="min-h-screen bg-gray-50 text-gray-800"><SettingsDashboardTopbar onLogoClick={onLogoClick} onNavigate={onNavigate} user={user} onLogout={onLogout} onProfile={onProfile} settingsSubmenuItems={mobileSettingsItems} activeSettingsSubmenuItem={activeTab} onSettingsSubmenuNavigate={handleTabChange} onAboutSectionNavigate={onAboutSectionChange} /><div className="mx-3 flex w-auto items-start gap-6 pt-4 pb-8 md:mx-4 lg:mx-6 lg:pt-6 max-[1024px]:flex-col"><aside className="hidden h-fit w-[300px] shrink-0 rounded-xl bg-white p-3 shadow-sm md:block lg:sticky lg:top-[88px] lg:h-[calc(100vh-112px)] lg:overflow-y-auto max-[1024px]:w-full"><h1 className="px-3 pb-3 text-lg font-bold">Cài đặt</h1><nav className="grid gap-1" aria-label="Menu cài đặt">{settingsMenuItems.map(({ item, isComingSoon }) => <button className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${isComingSoon ? "cursor-not-allowed opacity-50 text-slate-400" : activeTab === item ? "text-gray-900  font-semibold text-gray-900" : "text-gray-600 hover:bg-gray-50 cursor-pointer"}`} aria-disabled={isComingSoon} disabled={isComingSoon} key={item} type="button" onClick={isComingSoon ? undefined : () => handleTabChange(item)}><InboxIcon name={settingsIconByItem[item]} size={17} /> <span>{item}</span>{isComingSoon && <small className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">Sắp có</small>}{item === "Trợ lý AI" && <small className="ml-auto rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">Beta</small>}</button>)}</nav></aside><section className="w-full min-w-0 flex-1 rounded-xl bg-white shadow-sm">{children}</section></div></main>;
}

function SettingsDevelopmentPlaceholder({ title }: { title: string }) {
  return <div className="grid min-h-[520px] place-items-center p-6 text-center"><div><div className="mx-auto grid size-16 place-items-center rounded-full text-gray-900  text-3xl text-sky-500">⋯</div><h2 className="mt-5 text-2xl font-bold text-gray-900">{title}</h2><p className="mt-2 text-sm text-gray-500">Chức năng đang được phát triển</p></div></div>;
}

export function SettingsPage({ token, refresh, onLogoClick, onNavigate, user, onLogout, onProfile }: SettingsPageProps) {
  const [activeTab, setActiveTabState] = useState<SettingsItem>(() => settingsItemFromPath(window.location.pathname));
  const [activeAboutSection, setActiveAboutSectionState] = useState<AboutSection>(() => aboutSectionFromPath(window.location.pathname));
  const [isAddTagModalOpen, setIsAddTagModalOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<ConversationTagContract | null>(null);
  const [tagName, setTagName] = useState("");
  const [selectedColor, setSelectedColor] = useState(pickerColors[6]);
  const [tags, setTags] = useState<ConversationTagContract[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function setActiveTab(item: SettingsItem) {
    setActiveTabState(item);
    const nextPath = item === "Giới thiệu" ? aboutPathForSection(activeAboutSection) : settingsPathForItem(item);
    if (window.location.pathname !== nextPath) window.history.pushState({}, "", nextPath);
  }

  function setActiveAboutSection(section: AboutSection) {
    setActiveTabState("Giới thiệu");
    setActiveAboutSectionState(section);
    const nextPath = aboutPathForSection(section);
    if (window.location.pathname !== nextPath) window.history.pushState({}, "", nextPath);
  }

  useEffect(() => {
    const initialItem = settingsItemFromPath(window.location.pathname);
    const initialAboutSection = aboutSectionFromPath(window.location.pathname);
    const initialPath = initialItem === "Giới thiệu" ? aboutPathForSection(initialAboutSection) : settingsPathForItem(initialItem);
    setActiveTabState(initialItem);
    setActiveAboutSectionState(initialAboutSection);
    if (window.location.pathname !== initialPath) window.history.replaceState({}, "", initialPath);
    const handlePopState = () => {
      setActiveTabState(settingsItemFromPath(window.location.pathname));
      setActiveAboutSectionState(aboutSectionFromPath(window.location.pathname));
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    void apiRequest<{ tags: ConversationTagContract[] }>(API_URL, TAGS_API_PATH, token, {}, refresh)
      .then((result) => { if (active) setTags(result.tags); })
      .catch(() => { if (active) setError("Không thể tải danh sách thẻ"); })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [refresh, token]);

  function openAddTagModal() {
    setEditingTag(null);
    setTagName("");
    setSelectedColor(pickerColors[6]);
    setError(null);
    setIsAddTagModalOpen(true);
  }

  function openEditTagModal(tag: ConversationTagContract) {
    setEditingTag(tag);
    setTagName(tag.name);
    setSelectedColor(tag.color);
    setError(null);
    setIsAddTagModalOpen(true);
  }

  function closeTagModal() {
    setIsAddTagModalOpen(false);
    setEditingTag(null);
  }

  async function saveTag(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = tagName.trim();
    if (!name) return;
    setIsSaving(true);
    setError(null);
    try {
      const result = await apiRequest<ConversationTagContract>(API_URL, editingTag ? `${TAGS_API_PATH}/${editingTag.id}` : TAGS_API_PATH, token, {
        method: editingTag ? "PATCH" : "POST",
        body: JSON.stringify({ name, color: selectedColor })
      }, refresh);
      setTags((current) => editingTag ? current.map((tag) => tag.id === result.id ? result : tag) : [...current, result]);
      closeTagModal();
    } catch {
      setError(editingTag ? "Không thể cập nhật thẻ" : "Không thể thêm thẻ");
    } finally {
      setIsSaving(false);
    }
  }

  async function removeTag(tag: ConversationTagContract) {
    if (!window.confirm(`Xóa thẻ "${tag.name}"?`)) return;
    setDeletingId(tag.id);
    setError(null);
    try {
      await apiRequest<void>(API_URL, `${TAGS_API_PATH}/${tag.id}`, token, { method: "DELETE" }, refresh);
      setTags((current) => current.filter((item) => item.id !== tag.id));
    } catch {
      setError("Không thể xóa thẻ");
    } finally {
      setDeletingId(null);
    }
  }

  if (activeTab === "Giới thiệu") return <SettingsLayout activeTab={activeTab} onTabChange={setActiveTab} onAboutSectionChange={setActiveAboutSection} token={token} refresh={refresh} onLogoClick={onLogoClick} onNavigate={onNavigate} user={user} onLogout={onLogout} onProfile={onProfile}><AboutSectionContext.Provider value={{ activeSection: activeAboutSection, onSectionChange: setActiveAboutSection }}><AboutSettings /></AboutSectionContext.Provider></SettingsLayout>;
  if (activeTab === "Cài đặt chung") return <SettingsLayout activeTab={activeTab} onTabChange={setActiveTab} onAboutSectionChange={setActiveAboutSection} token={token} refresh={refresh} onLogoClick={onLogoClick} onNavigate={onNavigate} user={user} onLogout={onLogout} onProfile={onProfile}><GeneralSettingsPanel apiUrl={API_URL} token={token} refresh={refresh} /></SettingsLayout>;
  if (activeTab === "Trợ lý AI") return <SettingsLayout activeTab={activeTab} onTabChange={setActiveTab} onAboutSectionChange={setActiveAboutSection} token={token} refresh={refresh} onLogoClick={onLogoClick} onNavigate={onNavigate} user={user} onLogout={onLogout} onProfile={onProfile}><AiAssistantSettings token={token} refresh={refresh} ownerKey={user?.email} /></SettingsLayout>;
  if (activeTab === "Lịch sử") return <SettingsLayout activeTab={activeTab} onTabChange={setActiveTab} onAboutSectionChange={setActiveAboutSection} token={token} refresh={refresh} onLogoClick={onLogoClick} onNavigate={onNavigate} user={user} onLogout={onLogout} onProfile={onProfile}><SettingHistoryTimeline token={token} refresh={refresh} apiUrl={API_URL} /></SettingsLayout>;
  if (isSettingsPlaceholderTab(activeTab)) return <SettingsLayout activeTab={activeTab} onTabChange={setActiveTab} onAboutSectionChange={setActiveAboutSection} token={token} refresh={refresh} onLogoClick={onLogoClick} onNavigate={onNavigate} user={user} onLogout={onLogout} onProfile={onProfile}><SettingsDevelopmentPlaceholder title={activeTab} /></SettingsLayout>;
  return <SettingsLayout activeTab={activeTab} onTabChange={setActiveTab} onAboutSectionChange={setActiveAboutSection} token={token} refresh={refresh} onLogoClick={onLogoClick} onNavigate={onNavigate} user={user} onLogout={onLogout} onProfile={onProfile}><div className="p-6"><h2 className="mb-5 text-2xl font-bold text-gray-900">{activeTab}</h2><div className="rounded-2xl bg-white p-6 shadow-sm"><div className="flex items-start justify-between gap-4"><p className="max-w-2xl text-sm leading-6 text-gray-500">Thẻ dùng để đánh dấu trạng thái hội thoại trong Livechat (vd "Mua hàng", "Đã gửi") — 1 hội thoại có thể gắn nhiều thẻ cùng lúc.</p><button className="shrink-0 rounded-lg bg-sky-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 cursor-pointer" type="button" onClick={openAddTagModal}><span className="mr-1">+</span> Thêm thẻ</button></div>{error && <p className="mt-4 text-sm text-rose-600" role="alert">{error}</p>}{isLoading ? <p className="mt-7 text-sm text-gray-500">Đang tải thẻ...</p> : <div className="mt-7 flex flex-wrap gap-3">{tags.map((tag) => <span className="group inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:scale-[1.02]" style={{ backgroundColor: tag.color }} key={tag.id}>{tag.name}<span className="flex gap-1 opacity-60 transition group-hover:opacity-100"><button className="cursor-pointer transition-opacity hover:opacity-80" type="button" aria-label={`Sửa ${tag.name}`} onClick={() => openEditTagModal(tag)}><InboxIcon name="edit" size={14} /></button><button className="cursor-pointer disabled:cursor-not-allowed" type="button" aria-label={`Xóa ${tag.name}`} disabled={deletingId === tag.id} onClick={() => void removeTag(tag)}><InboxIcon name="trash" size={14} /></button></span></span>)}</div>}</div>{isAddTagModalOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4" role="presentation" onMouseDown={closeTagModal}><section className="w-full max-w-md animate-[composer-dialog-in_180ms_ease-out] rounded-2xl bg-white p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="add-tag-title" onMouseDown={(event) => event.stopPropagation()}><div className="flex items-center justify-between"><h3 className="text-lg font-bold" id="add-tag-title">{editingTag ? "Sửa thẻ hội thoại" : "Thêm thẻ hội thoại"}</h3><button className="grid size-8 place-items-center rounded-lg text-gray-500 hover:bg-gray-100 cursor-pointer" type="button" onClick={closeTagModal} aria-label="Đóng"><InboxIcon name="close" /></button></div><form className="mt-5 grid gap-4" onSubmit={saveTag}><label className="grid gap-1.5 text-sm font-semibold">Tên thẻ<input className="rounded-lg border border-gray-200 px-3 py-2.5 font-normal outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100" placeholder="Vd: Mua hàng" value={tagName} onChange={(event) => setTagName(event.target.value)} /></label><fieldset><legend className="mb-2 text-sm font-semibold">Màu thẻ</legend><div className="flex flex-wrap gap-2">{pickerColors.map((color) => <button className={`size-7 rounded-full ${selectedColor === color ? "ring-2 ring-black ring-offset-2" : ""} cursor-pointer transition-opacity hover:opacity-80`} style={{ backgroundColor: color }} type="button" aria-label={`Chọn màu ${color}`} key={color} onClick={() => setSelectedColor(color)} />)}</div><label className="flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 hover:border-sky-400 hover:text-gray-900"><input className="size-7 cursor-pointer rounded border-0 p-0" type="color" value={selectedColor} onChange={(event) => setSelectedColor(event.target.value)} aria-label="Tùy chỉnh màu" /><span>Tùy chỉnh màu</span></label></fieldset><button className="w-fit rounded-lg text-gray-900  px-3 py-2 text-sm font-semibold text-gray-900 cursor-pointer transition-opacity hover:opacity-80" type="button">Xem trước</button><div className="mt-2 flex justify-end gap-2"><button className="rounded-lg px-4 py-2 text-sm font-semibold text-gray-500 hover:bg-gray-50 cursor-pointer" type="button" onClick={closeTagModal}>Huỷ</button><button className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed" type="submit" disabled={isSaving}>{isSaving ? "Đang lưu..." : "Lưu"}</button></div></form></section></div>}</div></SettingsLayout>;
}
