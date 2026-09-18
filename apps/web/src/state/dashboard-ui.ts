export type ConnectionProviderId =
  | "pending"
  | "facebook"
  | "zalo"
  | "telegram"
  | "instagram"
  | "threads"
  | "tiktok"
  | "whatsapp"
  | "booking"
  | "airbnb";

export const initialConnectionProvider: ConnectionProviderId = "telegram";

export const dashboardNavItems = ["Hộp thư", "Đơn hàng", "Bài viết", "Thống kê", "Cài đặt"] as const;

export const platformIconBoxSize = 32;

export const brandLogoProviderIds = ["pending", "facebook", "zalo", "telegram", "instagram", "threads", "tiktok", "whatsapp", "booking", "airbnb"] as const;

export const connectionProviders: Array<{
  id: ConnectionProviderId;
  label: string;
  tone: string;
  badge?: string;
}> = [
  { id: "pending", label: "Chờ kích hoạt", tone: "pending" },
  { id: "facebook", label: "Facebook", tone: "facebook" },
  { id: "zalo", label: "Zalo", tone: "zalo" },
  { id: "telegram", label: "Telegram", tone: "telegram" },
  { id: "instagram", label: "Instagram", tone: "instagram" },
  { id: "threads", label: "Threads", tone: "threads", badge: "Beta" },
  { id: "tiktok", label: "TikTok", tone: "tiktok" },
  { id: "whatsapp", label: "WhatsApp", tone: "whatsapp" },
  { id: "booking", label: "Booking", tone: "booking", badge: "Beta" },
  { id: "airbnb", label: "Airbnb", tone: "airbnb", badge: "Beta" }
];
