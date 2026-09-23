import { WorkspaceModel } from "../models/workspace.model.js";
import { WorkspaceMemberModel, type WorkspaceRole } from "../models/workspace-member.model.js";

export interface WorkspaceRecord {
  id: string;
  ownerUserId: string;
  name: string;
}

export interface WorkspaceRepository {
  findByOwnerUserId(userId: string): Promise<WorkspaceRecord | null>;
  create(input: { ownerUserId: string; name: string }): Promise<WorkspaceRecord>;
}

export interface WorkspaceMembershipRepository {
  ensureOwner(workspaceId: string, userId: string): Promise<void>;
}

export class WorkspaceService {
  constructor(
    private readonly workspaces: WorkspaceRepository = {
      async findByOwnerUserId(userId) {
        const row = await WorkspaceModel.findOne({ ownerUserId: userId }).lean();
        return row ? { id: String(row._id), ownerUserId: String(row.ownerUserId), name: row.name } : null;
      },
      async create(input) {
        const row = await WorkspaceModel.create(input);
        return { id: String(row._id), ownerUserId: String(row.ownerUserId), name: row.name };
      }
    },
    private readonly memberships: WorkspaceMembershipRepository = {
      async ensureOwner(workspaceId, userId) {
        await WorkspaceMemberModel.updateOne(
          { workspaceId, userId },
          {
            $set: { role: "owner" satisfies WorkspaceRole },
            $setOnInsert: { workspaceId, userId, allowedPages: [] }
          },
          { upsert: true }
        );
      }
    }
  ) {}

  // Đảm bảo mọi tài khoản hiện hữu có Workspace riêng mà không nhân bản khi retry.
  async ensurePersonalWorkspace(userId: string, name = "Workspace"): Promise<WorkspaceRecord> {
    let workspace = await this.workspaces.findByOwnerUserId(userId);
    if (!workspace) {
      try {
        workspace = await this.workspaces.create({ ownerUserId: userId, name: name.trim() || "Workspace" });
      } catch (error) {
        if ((error as { code?: number } | null)?.code !== 11000) throw error;
        workspace = await this.workspaces.findByOwnerUserId(userId);
        if (!workspace) throw error;
      }
    }
    await this.memberships.ensureOwner(workspace.id, userId);
    return workspace;
  }
}

export const workspaceService = new WorkspaceService();
