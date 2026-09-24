import { AppError } from "../common/errors.js";
import { FacebookPageConnectionModel } from "../models/facebook-page-connection.model.js";
import { UserModel } from "../models/user.model.js";
import { WorkspaceMemberModel, type WorkspaceRole } from "../models/workspace-member.model.js";
import { WorkspaceModel } from "../models/workspace.model.js";

export interface WorkspaceMembership {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  allowedPages: string[];
}

export interface WorkspaceMemberView extends WorkspaceMembership {
  email: string;
  name: string;
}

export interface WorkspaceMemberDependencies {
  users: { findByEmail(email: string): Promise<{ id: string; email: string; name: string } | null> };
  workspaces: { findById(workspaceId: string): Promise<{ id: string; ownerUserId: string; name: string } | null> };
  memberships: {
    find(workspaceId: string, userId: string): Promise<WorkspaceMembership | null>;
    list(workspaceId: string): Promise<WorkspaceMemberView[]>;
    listForUser(userId: string): Promise<Array<{ id: string; name: string; role: WorkspaceRole }>>;
    create(input: WorkspaceMembership): Promise<void>;
    update(workspaceId: string, userId: string, patch: Pick<WorkspaceMembership, "role" | "allowedPages">): Promise<void>;
    remove(workspaceId: string, userId: string): Promise<void>;
  };
  pages: { findOwned(ownerUserId: string, pageIds: string[]): Promise<string[]> };
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
        role: membership.role, allowedPages: membership.allowedPages ?? []
      } : null;
    },
    async list(workspaceId) {
      const rows = await WorkspaceMemberModel.find({ workspaceId }).populate("userId", "email name").lean();
      return rows.flatMap((row) => {
        const user = row.userId as unknown as { _id?: unknown; email?: string; name?: string };
        if (!user || typeof user.email !== "string") return [];
        return [{
          workspaceId: String(row.workspaceId), userId: String(user._id), email: user.email, name: user.name ?? "",
          role: row.role, allowedPages: row.allowedPages ?? []
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
  pages: {
    async findOwned(ownerUserId, pageIds) {
      const rows = await FacebookPageConnectionModel.find({ userId: ownerUserId, pageId: { $in: pageIds } }).select("pageId").lean();
      return rows.map((row) => row.pageId);
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
    return { members: await this.dependencies.memberships.list(workspaceId) };
  }

  // Chỉ chủ Workspace được thay đổi role hoặc Page được cấp cho thành viên.
  async addMember(workspaceId: string, actorUserId: string, input: { email: string; role: "admin" | "staff"; allowedPages: string[] }) {
    const workspace = await this.requireOwner(workspaceId, actorUserId);
    const user = await this.dependencies.users.findByEmail(input.email.trim().toLowerCase());
    if (!user) throw new AppError(400, "WORKSPACE_ACCOUNT_NOT_FOUND", "Tài khoản không tồn tại, yêu cầu đăng ký trước");
    if (await this.dependencies.memberships.find(workspaceId, user.id)) {
      throw new AppError(409, "WORKSPACE_MEMBER_EXISTS", "Account is already a member of this Workspace");
    }
    const allowedPages = await this.validateAllowedPages(workspace.ownerUserId, input.role, input.allowedPages);
    await this.dependencies.memberships.create({ workspaceId, userId: user.id, role: input.role, allowedPages });
    return { member: { userId: user.id, email: user.email, name: user.name, role: input.role, allowedPages } };
  }

  // Cập nhật membership theo role hiện tại và giữ danh sách Page đã chọn khi patch không gửi trường này.
  async updateMember(workspaceId: string, actorUserId: string, userId: string, patch: { role?: "admin" | "staff"; allowedPages?: string[] }) {
    const workspace = await this.requireOwner(workspaceId, actorUserId);
    const current = await this.dependencies.memberships.find(workspaceId, userId);
    if (!current) throw new AppError(404, "WORKSPACE_MEMBER_NOT_FOUND", "Workspace member was not found");
    if (current.role === "owner") throw new AppError(409, "WORKSPACE_OWNER_IMMUTABLE", "Workspace owner cannot be changed here");
    const role = patch.role ?? current.role as "admin" | "staff";
    const allowedPages = patch.allowedPages === undefined
      ? (role === "admin" ? [] : current.allowedPages)
      : await this.validateAllowedPages(workspace.ownerUserId, role, patch.allowedPages);
    await this.dependencies.memberships.update(workspaceId, userId, { role, allowedPages });
    return { member: { userId, role, allowedPages } };
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

  // Staff chỉ được gán các Page đã kết nối trong Workspace đó; rỗng nghĩa là không giới hạn.
  private async validateAllowedPages(ownerUserId: string, role: "admin" | "staff", pageIds: string[]): Promise<string[]> {
    if (role === "admin" || pageIds.length === 0) return [];
    const uniquePageIds = [...new Set(pageIds)];
    const ownedPages = await this.dependencies.pages.findOwned(ownerUserId, uniquePageIds);
    if (ownedPages.length !== uniquePageIds.length) {
      throw new AppError(400, "WORKSPACE_PAGE_ACCESS_INVALID", "Selected Facebook Pages are not connected to this Workspace");
    }
    return uniquePageIds;
  }
}

export const workspaceMemberService = new WorkspaceMemberService();
