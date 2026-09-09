export function conversationDisplayName({ channelId }: { channelId: string; platform: string }): string {
  return `Khách hàng ${channelId.slice(-4)}`;
}

export function conversationInitials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");
}

export function formatConversationTime(value: string): string {
  return new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}
