import type { WorkspaceChannelRef } from "@nhuu-chat/contracts";
import { effectiveAllowedChannels, effectiveRevokedChannels, isWorkspaceChannelPlatform, workspaceChannelAccessFilter } from "../auth/workspace-channel-access.js";

type RealtimeAuth = { id: string; role: string; workspace?: { role?: "owner" | "admin" | "staff"; ownerUserId: string; allowedPages?: string[] | null; allowedChannels?: WorkspaceChannelRef[]; revokedChannels?: WorkspaceChannelRef[]; activeInstagramChannelIds?: string[] } };
type ConversationAccess = { platform?: unknown; ownerId?: unknown; channelId?: unknown; assignedAgentId?: unknown };

// Chia sẻ phiên cá nhân trong Workspace chỉ cho thành viên được gán đúng platform của chủ Workspace.
export function conversationAccessFilter(auth: RealtimeAuth): Record<string, unknown> {
  if (auth.workspace) {
    const workspaceFilter = workspaceChannelAccessFilter(
      auth.workspace.ownerUserId, effectiveAllowedChannels(auth.workspace), effectiveRevokedChannels(auth.workspace),
      auth.workspace.role === "staff" ? auth.workspace.activeInstagramChannelIds : undefined
    );
    const legacyAccess = auth.role === "admin"
      ? { $or: [{ platform: { $ne: "zalo_personal" } }, { ownerId: auth.id }, { assignedAgentId: auth.id }] }
      : auth.role === "agent" ? { assignedAgentId: auth.id } : { ownerId: auth.id };
    return { $or: [
      workspaceFilter,
      { platform: { $nin: ["facebook", "instagram", "zalo", "telegram", "zalo_personal", "telegram_personal"] }, ...legacyAccess }
    ] };
  }
  if (auth.role === "admin") {
    return {
      $or: [
        { platform: { $ne: "zalo_personal" } },
        { ownerId: auth.id },
        { assignedAgentId: auth.id }
      ]
    };
  }
  return auth.role === "agent" ? { assignedAgentId: auth.id } : { ownerId: auth.id };
}

export function canJoinConversation(auth: RealtimeAuth, conversation: ConversationAccess): boolean {
  if (isWorkspaceChannelPlatform(conversation.platform) && !auth.workspace && conversation.platform === "facebook") return false;
  if (auth.workspace && isWorkspaceChannelPlatform(conversation.platform)) {
    if (auth.workspace.role === "staff" && conversation.platform === "instagram"
      && auth.workspace.activeInstagramChannelIds !== undefined
      && !auth.workspace.activeInstagramChannelIds.includes(String(conversation.channelId ?? ""))) return false;
    if (effectiveRevokedChannels(auth.workspace).some((channel) => channel.platform === conversation.platform
      && (conversation.platform === "zalo_personal" || conversation.platform === "telegram_personal"
        ? channel.channelId === auth.workspace?.ownerUserId
        : channel.channelId === String(conversation.channelId ?? "")))) return false;
    const allowedChannels = effectiveAllowedChannels(auth.workspace);
    if (auth.workspace.role === "staff" && conversation.platform === "instagram"
      && !allowedChannels.some((channel) => channel.platform === "instagram"
        && channel.channelId === String(conversation.channelId ?? ""))) return false;
    return String(conversation.ownerId ?? "") === auth.workspace.ownerUserId
      && (!allowedChannels.length || allowedChannels.some((channel) => channel.platform === conversation.platform
        && (conversation.platform === "zalo_personal" || conversation.platform === "telegram_personal"
          ? channel.channelId === auth.workspace?.ownerUserId
          : channel.channelId === String(conversation.channelId ?? ""))));
  }
  if (auth.role === "admin") {
    if (conversation.platform !== "zalo_personal") return true;
    return String(conversation.ownerId ?? "") === auth.id
      || String(conversation.assignedAgentId ?? "") === auth.id;
  }
  if (auth.role === "agent") return String(conversation.assignedAgentId ?? "") === auth.id;
  return String(conversation.ownerId ?? "") === auth.id;
}

export function canMarkConversationRead(auth: RealtimeAuth, conversation: ConversationAccess): boolean {
  return canJoinConversation(auth, conversation);
}
