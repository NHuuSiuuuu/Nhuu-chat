import type { WorkspaceChannelPlatform, WorkspaceChannelRef } from "@nhuu-chat/contracts";

export const workspaceChannelPlatforms: readonly WorkspaceChannelPlatform[] = ["facebook", "instagram", "zalo", "telegram", "zalo_personal", "telegram_personal"];

type PermissionSource = {
  allowedChannels?: readonly { platform?: unknown; channelId?: unknown }[] | null;
  allowedPages?: readonly string[] | null;
};

// Chuẩn hóa dữ liệu mới và quyền Page cũ về cùng cặp nền tảng/ID.
export function effectiveAllowedChannels(source: PermissionSource): WorkspaceChannelRef[] {
  if (source.allowedChannels && source.allowedChannels.length === 0 && (!source.allowedPages || source.allowedPages.length === 0)) return [];
  const refs = new Map<string, WorkspaceChannelRef>();
  for (const item of source.allowedChannels ?? []) {
    if (!workspaceChannelPlatforms.includes(item.platform as WorkspaceChannelPlatform) || typeof item.channelId !== "string" || !item.channelId.trim()) continue;
    const ref = { platform: item.platform as WorkspaceChannelPlatform, channelId: item.channelId.trim() };
    refs.set(`${ref.platform}:${ref.channelId}`, ref);
  }
  if (refs.size > 0) return [...refs.values()];
  return [...new Set(source.allowedPages ?? [])]
    .filter((channelId) => typeof channelId === "string" && channelId.trim())
    .map((channelId) => ({ platform: "facebook" as const, channelId: channelId.trim() }));
}

// Tạo scope theo owner Workspace; ID kênh luôn ghép với platform để tránh va chạm.
export function workspaceChannelAccessFilter(ownerUserId: string, allowedChannels: readonly WorkspaceChannelRef[]): Record<string, unknown> {
  if (allowedChannels.length === 0) return { ownerId: ownerUserId, platform: { $in: workspaceChannelPlatforms } };
  const channels = allowedChannels.map(({ platform, channelId }) => platform === "zalo_personal" || platform === "telegram_personal"
    ? { ownerId: ownerUserId, platform }
    : { ownerId: ownerUserId, platform, channelId });
  return channels.length === 1 ? channels[0]! : { $or: channels };
}

export function isWorkspaceChannelPlatform(platform: unknown): platform is WorkspaceChannelPlatform {
  return workspaceChannelPlatforms.includes(platform as WorkspaceChannelPlatform);
}
