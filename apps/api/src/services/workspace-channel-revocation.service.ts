import type { WorkspaceChannelRef } from "@nhuu-chat/contracts";

import { WorkspaceMemberModel } from "../models/workspace-member.model.js";
import { WorkspaceModel } from "../models/workspace.model.js";

export interface AffectedWorkspaceMembers {
  workspaceId: string;
  memberUserIds: string[];
}

async function findWorkspace(ownerUserId: string) {
  const workspace = await WorkspaceModel.findOne({ ownerUserId }).select("_id").lean();
  return workspace ? String(workspace._id) : null;
}

function memberIds(rows: Array<{ userId: unknown }>): string[] {
  return [...new Set(rows.map((row) => String(row.userId)))];
}

// Revocations override a member's saved grant or unrestricted empty grant without changing access to other channels.
export async function revokeWorkspaceChannel(ownerUserId: string, channel: WorkspaceChannelRef): Promise<AffectedWorkspaceMembers | null> {
  const workspaceId = await findWorkspace(ownerUserId);
  if (!workspaceId) return null;
  const filter = { workspaceId, role: "staff" };
  const rows = await WorkspaceMemberModel.find(filter).select("userId").lean();
  if (rows.length) {
    await WorkspaceMemberModel.updateMany(filter, { $addToSet: { revokedChannels: channel } });
  }
  return { workspaceId, memberUserIds: memberIds(rows) };
}

// Reconnection removes only the matching deny entry so the prior saved grant can take effect again.
export async function clearWorkspaceChannelRevocation(ownerUserId: string, channel: WorkspaceChannelRef): Promise<AffectedWorkspaceMembers | null> {
  const workspaceId = await findWorkspace(ownerUserId);
  if (!workspaceId) return null;
  const filter = {
    workspaceId, role: "staff",
    revokedChannels: { $elemMatch: { platform: channel.platform, channelId: channel.channelId } }
  };
  const rows = await WorkspaceMemberModel.find(filter).select("userId").lean();
  if (rows.length) {
    await WorkspaceMemberModel.updateMany(filter, { $pull: { revokedChannels: channel } });
  }
  return { workspaceId, memberUserIds: memberIds(rows) };
}
