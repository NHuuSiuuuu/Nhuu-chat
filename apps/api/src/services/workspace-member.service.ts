import { AppError } from "../common/errors.js";
import type { WorkspaceChannelPlatform, WorkspaceChannelRef } from "@nhuu-chat/contracts";
import { effectiveAllowedChannels, effectiveRevokedChannels, isWorkspaceChannelPlatform, isWorkspaceChannelRevoked, workspaceChannelPlatforms } from "../auth/workspace-channel-access.js";
import { ConversationModel } from "../models/conversation.model.js";
import { FacebookPageConnectionModel } from "../models/facebook-page-connection.model.js";
import { InstagramAccountConnectionModel } from "../models/instagram-account-connection.model.js";
import { TelegramPersonalSessionModel } from "../channels/telegram-personal/telegram-personal.model.js";
import { ZaloPersonalSessionModel } from "../channels/zalo-personal/zalo-personal.model.js";
import { UserModel } from "../models/user.model.js";
import { WorkspaceMemberModel, type WorkspaceRole } from "../models/workspace-member.model.js";
import { WorkspaceModel } from "../models/workspace.model.js";

export interface WorkspaceMembership {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  allowedPages: string[];
  allowedChannels?: WorkspaceChannelRef[];
  revokedChannels?: WorkspaceChannelRef[];
}

export interface WorkspaceMemberView extends WorkspaceMembership {
  email: string;
  name: string;
}

export interface WorkspaceChannelView extends WorkspaceChannelRef {
  name: string;
  avatarUrl?: string;
  displayId?: string;
}

// Chuyển phiên đăng nhập cá nhân thành kênh Workspace gắn cố định với chủ sở hữu phiên.
export function personalSessionWorkspaceChannels(ownerUserId: string, sessions: {
  telegram?: { telegramUserId: string; displayName: string; username?: string | null; avatarUrl?: string | null } | null;
  zalo?: { zaloUserId: string; displayName?: string | null; avatarUrl?: string | null } | null;
}): WorkspaceChannelView[] {
  const channels: WorkspaceChannelView[] = [];
  if (sessions.zalo) channels.push({
    platform: "zalo_personal", channelId: ownerUserId,
    name: sessions.zalo.displayName?.trim() || "Zalo cá nhân", displayId: sessions.zalo.zaloUserId,
    ...(sessions.zalo.avatarUrl ? { avatarUrl: sessions.zalo.avatarUrl } : {})
  });
  if (sessions.telegram) channels.push({
    platform: "telegram_personal", channelId: ownerUserId,
    name: sessions.telegram.displayName?.trim() || sessions.telegram.username?.trim() || "Telegram cá nhân",
    displayId: sessions.telegram.telegramUserId,
    ...(sessions.telegram.avatarUrl ? { avatarUrl: sessions.telegram.avatarUrl } : {})
  });
  return channels;
}

export interface WorkspaceMemberDependencies {
  users: { findByEmail(email: string): Promise<{ id: string; email: string; name: string } | null> };
  workspaces: { findById(workspaceId: string): Promise<{ id: string; ownerUserId: string; name: string } | null> };
  memberships: {
    find(workspaceId: string, userId: string): Promise<WorkspaceMembership | null>;
    list(workspaceId: string): Promise<WorkspaceMemberView[]>;
    listForUser(userId: string): Promise<Array<{ id: string; name: string; role: WorkspaceRole }>>;
    create(input: WorkspaceMembership): Promise<void>;
    update(workspaceId: string, userId: string, patch: Pick<WorkspaceMembership, "role" | "allowedPages" | "allowedChannels">): Promise<void>;
    remove(workspaceId: string, userId: string): Promise<void>;
  };
  channels: {
    listOwned(ownerUserId: string): Promise<WorkspaceChannelView[]>;
    findOwned(ownerUserId: string, channels: WorkspaceChannelRef[]): Promise<WorkspaceChannelRef[]>;
  };
}

const defaultDependencies: WorkspaceMemberDependencies = {
  users: {
    async findByEmail(email) {
      const user = await UserModel.findOne({ email }).select("_id email name").lean();
      return user ? { id: String(user._id), email: user.email, name: user.name } : null;
    }
  },
  workspaces: {
    async findById(workspaceId) {
      const workspace = await WorkspaceModel.findById(workspaceId).lean();
      return workspace ? { id: String(workspace._id), ownerUserId: String(workspace.ownerUserId), name: workspace.name } : null;
    }
  },
  memberships: {
    async find(workspaceId, userId) {
      const membership = await WorkspaceMemberModel.findOne({ workspaceId, userId }).lean();
      return membership ? {
        workspaceId: String(membership.workspaceId), userId: String(membership.userId),
        role: membership.role, allowedPages: membership.allowedPages ?? [], allowedChannels: membership.allowedChannels,
        revokedChannels: membership.revokedChannels ?? []
      } : null;
    },
    async list(workspaceId) {
      const rows = await WorkspaceMemberModel.find({ workspaceId }).populate("userId", "email name").lean();
      return rows.flatMap((row) => {
        const user = row.userId as unknown as { _id?: unknown; email?: string; name?: string };
        if (!user || typeof user.email !== "string") return [];
        return [{
          workspaceId: String(row.workspaceId), userId: String(user._id), email: user.email, name: user.name ?? "",
          role: row.role, allowedPages: row.allowedPages ?? [], allowedChannels: row.allowedChannels,
          revokedChannels: row.revokedChannels ?? []
        }];
      });
    },
    async listForUser(userId) {
      const rows = await WorkspaceMemberModel.find({ userId }).populate("workspaceId", "name").lean();
      return rows.flatMap((row) => {
        const workspace = row.workspaceId as unknown as { _id?: unknown; name?: string };
        if (!workspace?._id) return [];
        return [{ id: String(workspace._id), name: workspace.name ?? "Workspace", role: row.role }];
      });
    },
    async create(input) {
      await WorkspaceMemberModel.create(input);
    },
    async update(workspaceId, userId, patch) {
      const result = await WorkspaceMemberModel.updateOne({ workspaceId, userId }, { $set: patch }, { runValidators: true });
      if (result.matchedCount !== 1) throw new AppError(404, "WORKSPACE_MEMBER_NOT_FOUND", "Workspace member was not found");
    },
    async remove(workspaceId, userId) {
      const result = await WorkspaceMemberModel.deleteOne({ workspaceId, userId, role: { $ne: "owner" } });
      if (result.deletedCount !== 1) throw new AppError(404, "WORKSPACE_MEMBER_NOT_FOUND", "Workspace member was not found");
    }
  },
  channels: {
    // Liệt kê mọi nguồn kênh dùng chung và các phiên cá nhân đang hoạt động của chủ Workspace.
    async listOwned(ownerUserId) {
      const sharedPlatforms = workspaceChannelPlatforms.filter((platform) => platform !== "zalo_personal" && platform !== "telegram_personal");
      const [pageRows, instagramRows, conversationRows, telegramSession, zaloSession] = await Promise.all([
        FacebookPageConnectionModel.find({ userId: ownerUserId, status: "connected" }).select("pageId pageName avatarUrl").lean(),
        InstagramAccountConnectionModel.find({ ownerUserId, status: "connected" }).select("instagramUserId username displayName avatarUrl").lean(),
        ConversationModel.aggregate<{ _id: { platform: string; channelId: string }; name?: string }>([
          { $match: { ownerId: ownerUserId, platform: { $in: sharedPlatforms.filter((platform) => platform !== "facebook" && platform !== "instagram") } } },
          { $sort: { updatedAt: 1 } },
          { $group: { _id: { platform: "$platform", channelId: "$channelId" }, name: { $last: "$conversationName" } } }
        ]),
        TelegramPersonalSessionModel.findOne({ userId: ownerUserId, status: "active" }).select("telegramUserId displayName username avatarUrl").lean(),
        ZaloPersonalSessionModel.findOne({ ownerId: ownerUserId, status: "connected", lastErrorCode: null }).select("zaloUserId displayName avatarUrl").lean()
      ]);
      const channels = new Map<string, WorkspaceChannelView>();
      for (const page of pageRows) channels.set(`facebook:${page.pageId}`, {
        platform: "facebook", channelId: page.pageId, name: page.pageName ?? page.pageId,
        ...(page.avatarUrl ? { avatarUrl: page.avatarUrl } : {})
      });
      for (const account of instagramRows) channels.set(`instagram:${account.instagramUserId}`, {
        platform: "instagram", channelId: account.instagramUserId,
        name: account.displayName?.trim() || account.username?.trim() || account.instagramUserId,
        ...(account.avatarUrl ? { avatarUrl: account.avatarUrl } : {})
      });
      for (const row of conversationRows) {
        if (row._id.platform === "instagram" || !isWorkspaceChannelPlatform(row._id.platform)) continue;
        channels.set(`${row._id.platform}:${row._id.channelId}`, {
          platform: row._id.platform as WorkspaceChannelPlatform,
          channelId: row._id.channelId, name: row.name?.trim() || row._id.channelId
        });
      }
      for (const sessionChannel of personalSessionWorkspaceChannels(ownerUserId, { telegram: telegramSession, zalo: zaloSession })) {
        channels.set(`${sessionChannel.platform}:${sessionChannel.channelId}`, sessionChannel);
      }
      return [...channels.values()].sort((left, right) => left.platform.localeCompare(right.platform) || left.name.localeCompare(right.name));
    },
    async findOwned(ownerUserId, refs) {
      const available = await this.listOwned(ownerUserId);
      const availableKeys = new Set(available.map((item) => `${item.platform}:${item.channelId}`));
      return refs.filter((item) => availableKeys.has(`${item.platform}:${item.channelId}`));
    }
  }
};

export class WorkspaceMemberService {
  constructor(private readonly dependencies: WorkspaceMemberDependencies = defaultDependencies) {}

  async listWorkspaces(userId: string) {
    return { workspaces: await this.dependencies.memberships.listForUser(userId) };
  }

  async listMembers(workspaceId: string, userId: string) {
    await this.requireMembership(workspaceId, userId);
    return { members: (await this.dependencies.memberships.list(workspaceId)).map((member) => this.memberAccessView(member)) };
  }

  async listChannels(workspaceId: string, userId: string) {
    const membership = await this.requireMembership(workspaceId, userId);
    const workspace = await this.dependencies.workspaces.findById(workspaceId);
    if (!workspace) throw new AppError(404, "WORKSPACE_NOT_FOUND", "Workspace was not found");
    const channels = await this.dependencies.channels.listOwned(workspace.ownerUserId);
    const allowed = membership.role === "staff" ? effectiveAllowedChannels(membership) : [];
    const allowedKeys = new Set(allowed.map((item) => `${item.platform}:${item.channelId}`));
    const visible = membership.role === "staff"
      ? channels.filter((item) => item.platform === "instagram"
        ? allowedKeys.has(`${item.platform}:${item.channelId}`)
        : !allowed.length || allowedKeys.has(`${item.platform}:${item.channelId}`))
      : channels;
    return { channels: membership.role === "staff"
      ? visible.filter((item) => !isWorkspaceChannelRevoked(membership, item.platform, item.channelId))
      : visible };
  }

  // Chỉ chủ Workspace được thay đổi role hoặc Page được cấp cho thành viên.
  async addMember(workspaceId: string, actorUserId: string, input: { email: string; role: "admin" | "staff"; allowedPages?: string[]; allowedChannels?: WorkspaceChannelRef[] }) {
    const workspace = await this.requireOwner(workspaceId, actorUserId);
    const user = await this.dependencies.users.findByEmail(input.email.trim().toLowerCase());
    if (!user) throw new AppError(400, "WORKSPACE_ACCOUNT_NOT_FOUND", "Tài khoản không tồn tại, yêu cầu đăng ký trước");
    if (await this.dependencies.memberships.find(workspaceId, user.id)) {
      throw new AppError(409, "WORKSPACE_MEMBER_EXISTS", "Account is already a member of this Workspace");
    }
    const refs = input.allowedChannels ?? (input.allowedPages ?? []).map((channelId) => ({ platform: "facebook" as const, channelId }));
    const allowedChannels = await this.validateAllowedChannels(workspace.ownerUserId, input.role, refs);
    const allowedPages = this.facebookPageIds(allowedChannels);
    await this.dependencies.memberships.create({ workspaceId, userId: user.id, role: input.role, allowedPages, allowedChannels });
    return { member: { userId: user.id, email: user.email, name: user.name, role: input.role, allowedPages, allowedChannels } };
  }

  // Cập nhật membership theo role hiện tại và giữ danh sách Page đã chọn khi patch không gửi trường này.
  async updateMember(workspaceId: string, actorUserId: string, userId: string, patch: { role?: "admin" | "staff"; allowedPages?: string[]; allowedChannels?: WorkspaceChannelRef[] }) {
    const workspace = await this.requireOwner(workspaceId, actorUserId);
    const current = await this.dependencies.memberships.find(workspaceId, userId);
    if (!current) throw new AppError(404, "WORKSPACE_MEMBER_NOT_FOUND", "Workspace member was not found");
    if (current.role === "owner") throw new AppError(409, "WORKSPACE_OWNER_IMMUTABLE", "Workspace owner cannot be changed here");
    const role = patch.role ?? current.role as "admin" | "staff";
    const currentChannels = effectiveAllowedChannels(current);
    const requestedChannels = patch.allowedChannels ?? (patch.allowedPages === undefined
      ? currentChannels
      : patch.allowedPages.map((channelId) => ({ platform: "facebook" as const, channelId })));
    const allowedChannels = await this.validateAllowedChannels(workspace.ownerUserId, role, requestedChannels);
    const allowedPages = this.facebookPageIds(allowedChannels);
    await this.dependencies.memberships.update(workspaceId, userId, { role, allowedPages, allowedChannels });
    return { member: { userId, role, allowedPages, allowedChannels } };
  }

  // Chỉ xóa thành viên thường; membership owner được bảo vệ cả ở service và truy vấn delete.
  async removeMember(workspaceId: string, actorUserId: string, userId: string): Promise<void> {
    await this.requireOwner(workspaceId, actorUserId);
    const current = await this.dependencies.memberships.find(workspaceId, userId);
    if (!current) throw new AppError(404, "WORKSPACE_MEMBER_NOT_FOUND", "Workspace member was not found");
    if (current.role === "owner") throw new AppError(409, "WORKSPACE_OWNER_IMMUTABLE", "Workspace owner cannot be removed");
    await this.dependencies.memberships.remove(workspaceId, userId);
  }

  private async requireMembership(workspaceId: string, userId: string): Promise<WorkspaceMembership> {
    const membership = await this.dependencies.memberships.find(workspaceId, userId);
    if (!membership) throw new AppError(403, "WORKSPACE_MEMBERSHIP_REQUIRED", "Workspace membership is required");
    return membership;
  }

  // So khớp owner membership với chủ dữ liệu đã được lưu để không tin id từ client.
  private async requireOwner(workspaceId: string, userId: string) {
    const membership = await this.requireMembership(workspaceId, userId);
    if (membership.role !== "owner") throw new AppError(403, "WORKSPACE_OWNER_REQUIRED", "Only the Workspace owner can manage members");
    const workspace = await this.dependencies.workspaces.findById(workspaceId);
    if (!workspace || workspace.ownerUserId !== userId) {
      throw new AppError(404, "WORKSPACE_NOT_FOUND", "Workspace was not found");
    }
    return workspace;
  }

  private memberAccessView<T extends WorkspaceMembership>(member: T) {
    const allowedChannels = effectiveAllowedChannels(member);
    return { ...member, allowedChannels, allowedPages: this.facebookPageIds(allowedChannels) };
  }

  private facebookPageIds(channels: readonly WorkspaceChannelRef[]): string[] {
    return channels.filter((item) => item.platform === "facebook").map((item) => item.channelId);
  }

  // Chỉ lưu quyền trỏ đến kênh thực sự thuộc Workspace; danh sách rỗng nghĩa là không giới hạn.
  private async validateAllowedChannels(ownerUserId: string, role: "admin" | "staff", channels: WorkspaceChannelRef[]): Promise<WorkspaceChannelRef[]> {
    if (role === "admin" || channels.length === 0) return [];
    const unique = [...new Map(channels.map((item) => [`${item.platform}:${item.channelId}`, item])).values()];
    const owned = await this.dependencies.channels.findOwned(ownerUserId, unique);
    if (owned.length !== unique.length) {
      throw new AppError(400, "WORKSPACE_CHANNEL_ACCESS_INVALID", "Selected channels are not connected to this Workspace");
    }
    return unique;
  }
}

export const workspaceMemberService = new WorkspaceMemberService();
