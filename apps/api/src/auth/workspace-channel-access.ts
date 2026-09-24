import type { WorkspaceChannelPlatform, WorkspaceChannelRef } from "@nhuu-chat/contracts";

export const workspaceChannelPlatforms: readonly WorkspaceChannelPlatform[] = ["facebook", "instagram", "zalo", "telegram", "zalo_personal", "telegram_personal"];

type PermissionSource = {
  allowedChannels?: readonly { platform?: unknown; channelId?: unknown }[] | null;
  allowedPages?: readonly string[] | null;
  revokedChannels?: readonly { platform?: unknown; channelId?: unknown }[] | null;
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

export function effectiveRevokedChannels(source: PermissionSource): WorkspaceChannelRef[] {
  const refs = new Map<string, WorkspaceChannelRef>();
  for (const item of source.revokedChannels ?? []) {
    if (!workspaceChannelPlatforms.includes(item.platform as WorkspaceChannelPlatform) || typeof item.channelId !== "string" || !item.channelId.trim()) continue;
    const ref = { platform: item.platform as WorkspaceChannelPlatform, channelId: item.channelId.trim() };
    refs.set(`${ref.platform}:${ref.channelId}`, ref);
  }
  return [...refs.values()];
}

export function isWorkspaceChannelRevoked(source: PermissionSource, platform: unknown, channelId: unknown): boolean {
  if (!isWorkspaceChannelPlatform(platform) || typeof channelId !== "string") return false;
  return effectiveRevokedChannels(source).some((channel) => channel.platform === platform && channel.channelId === channelId);
}

// Tạo scope theo owner Workspace; ID kênh luôn ghép với platform để tránh va chạm.
export function workspaceChannelAccessFilter(
  ownerUserId: string,
  allowedChannels: readonly WorkspaceChannelRef[],
  revokedChannels: readonly WorkspaceChannelRef[] = [],
  activeInstagramChannelIds?: readonly string[]
): Record<string, unknown> {
  const currentChannels = activeInstagramChannelIds === undefined ? allowedChannels : allowedChannels.filter((channel) =>
    channel.platform !== "instagram" || activeInstagramChannelIds.includes(channel.channelId));
  const channels = currentChannels.map(({ platform, channelId }) => platform === "zalo_personal" || platform === "telegram_personal"
    ? { ownerId: ownerUserId, platform }
    : { ownerId: ownerUserId, platform, channelId });
  let accessFilter: Record<string, unknown>;
  if (allowedChannels.length === 0 && activeInstagramChannelIds !== undefined) {
    const nonInstagramPlatforms = workspaceChannelPlatforms.filter((platform) => platform !== "instagram");
    accessFilter = { ownerId: ownerUserId, platform: { $in: nonInstagramPlatforms } };
  } else if (allowedChannels.length === 0) {
    accessFilter = { ownerId: ownerUserId, platform: { $in: workspaceChannelPlatforms } };
  } else if (channels.length === 0) {
    accessFilter = { ownerId: ownerUserId, platform: "instagram", channelId: { $in: [] } };
  } else {
    accessFilter = channels.length === 1 ? channels[0]! : { $or: channels };
  }
  if (revokedChannels.length === 0) return accessFilter;
  const revokedFilters = revokedChannels.map(({ platform, channelId }) => platform === "zalo_personal" || platform === "telegram_personal"
    ? { ownerId: ownerUserId, platform }
    : { ownerId: ownerUserId, platform, channelId });
  return { $and: [accessFilter, { $nor: revokedFilters }] };
}

export function isWorkspaceChannelPlatform(platform: unknown): platform is WorkspaceChannelPlatform {
  return workspaceChannelPlatforms.includes(platform as WorkspaceChannelPlatform);
}
