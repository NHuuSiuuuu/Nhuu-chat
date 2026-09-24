interface ConversationPresentationInput {
  channelId: string;
  platform: string;
  customerName?: string;
  conversationName?: string | null;
  conversationType?: "private" | "group";
}

export function conversationAccountName({ accountName, platform }: { accountName?: string; platform: string }): string {
  return accountName?.trim() || conversationPlatformLabel(platform);
}

export const CONVERSATION_LIST_MIN_WIDTH = 72;
export const CONVERSATION_LIST_MAX_WIDTH = 395;

export function clampConversationListWidth(width: number): number {
  return Math.min(CONVERSATION_LIST_MAX_WIDTH, Math.max(CONVERSATION_LIST_MIN_WIDTH, width));
}

export function conversationDisplayName({ channelId, customerName, conversationName, conversationType }: ConversationPresentationInput): string {
  if (conversationName?.trim()) return conversationName.trim();
  if (conversationType === "group") return "Nhóm hội thoại";
  if (customerName?.trim()) return customerName.trim();
  return `Khách hàng ${channelId.slice(-4)}`;
}

export function conversationInitials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");
}

export function formatConversationTime(value: string): string {
  return new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}

export function conversationPlatformLabel(platform: string): string {
  const labels: Record<string, string> = { telegram_personal: "Telegram", telegram: "Telegram", zalo_personal: "Zalo", zalo: "Zalo", facebook: "Facebook", instagram: "Instagram" };
  return labels[platform] ?? platform;
}

export function isNearLatestMessage(metrics: { scrollTop: number; clientHeight: number; scrollHeight: number }, threshold = 120): boolean {
  return metrics.scrollHeight - (metrics.scrollTop + metrics.clientHeight) <= threshold;
}

export function markConversationRead<T extends { id: string; unreadCount: number }>(conversation: T): T {
  return { ...conversation, unreadCount: 0 };
}

export function isRequestedConversationAlreadyActive(requestedId: string | null | undefined, activeId: string | null): boolean {
  return Boolean(requestedId && requestedId === activeId);
}
