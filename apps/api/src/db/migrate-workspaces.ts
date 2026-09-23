import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import mongoose from "mongoose";

import { WorkspaceModel } from "../models/workspace.model.js";
import { WorkspaceMemberModel } from "../models/workspace-member.model.js";
import { UserModel } from "../models/user.model.js";
import { workspaceService } from "../services/workspace.service.js";

export interface WorkspaceBootstrapUser { id: string; name: string; }
export interface WorkspaceBootstrapWorkspace { id: string; ownerUserId: string; }
export interface WorkspaceBootstrapOwnerMembership { workspaceId: string; userId: string; role: string; }
export interface WorkspaceBootstrapPlan {
  workspaceUsersToCreate: string[];
  ownerMembershipsToCreate: Array<{ workspaceId: string; userId: string }>;
}

export interface WorkspaceBootstrapRepository {
  ensureIndexes(): Promise<void>;
  listUsers(): Promise<WorkspaceBootstrapUser[]>;
  listWorkspaces(): Promise<WorkspaceBootstrapWorkspace[]>;
  listOwnerMemberships(): Promise<WorkspaceBootstrapOwnerMembership[]>;
  ensurePersonalWorkspace(userId: string, name: string): Promise<unknown>;
}

// Lập danh sách Workspace và owner membership còn thiếu mà không sửa dữ liệu hiện tại.
export function buildWorkspaceBootstrapPlan(
  users: WorkspaceBootstrapUser[],
  workspaces: WorkspaceBootstrapWorkspace[],
  memberships: WorkspaceBootstrapOwnerMembership[]
): WorkspaceBootstrapPlan {
  const workspaceByOwner = new Map(workspaces.map((workspace) => [workspace.ownerUserId, workspace]));
  const ownerMemberships = new Set(memberships.filter((membership) => membership.role === "owner")
    .map((membership) => `${membership.workspaceId}:${membership.userId}`));
  const workspaceUsersToCreate: string[] = [];
  const ownerMembershipsToCreate: Array<{ workspaceId: string; userId: string }> = [];

  for (const user of users) {
    const workspace = workspaceByOwner.get(user.id);
    if (!workspace) {
      workspaceUsersToCreate.push(user.id);
      continue;
    }
    if (!ownerMemberships.has(`${workspace.id}:${user.id}`)) {
      ownerMembershipsToCreate.push({ workspaceId: workspace.id, userId: user.id });
    }
  }

  return { workspaceUsersToCreate, ownerMembershipsToCreate };
}

// Hỗ trợ chạy thử chỉ đọc; chỉ ghi khi người vận hành truyền cờ apply rõ ràng.
export async function migrateWorkspaceOwners(
  repository: WorkspaceBootstrapRepository,
  apply = false
): Promise<WorkspaceBootstrapPlan> {
  const [users, workspaces, memberships] = await Promise.all([
    repository.listUsers(), repository.listWorkspaces(), repository.listOwnerMemberships()
  ]);
  const plan = buildWorkspaceBootstrapPlan(users, workspaces, memberships);
  if (apply) {
    await repository.ensureIndexes();
    await Promise.all(users.map((user) => repository.ensurePersonalWorkspace(user.id, user.name)));
  }
  return plan;
}

const repository: WorkspaceBootstrapRepository = {
  async ensureIndexes() {
    await Promise.all([WorkspaceModel.createIndexes(), WorkspaceMemberModel.createIndexes()]);
  },
  async listUsers() {
    const users = await UserModel.find().select("_id name").lean();
    return users.map((user) => ({ id: String(user._id), name: user.name }));
  },
  async listWorkspaces() {
    const workspaces = await WorkspaceModel.find().select("_id ownerUserId").lean();
    return workspaces.map((workspace) => ({ id: String(workspace._id), ownerUserId: String(workspace.ownerUserId) }));
  },
  async listOwnerMemberships() {
    const memberships = await WorkspaceMemberModel.find({ role: "owner" }).select("workspaceId userId role").lean();
    return memberships.map((membership) => ({
      workspaceId: String(membership.workspaceId), userId: String(membership.userId), role: membership.role
    }));
  },
  ensurePersonalWorkspace: (userId, name) => workspaceService.ensurePersonalWorkspace(userId, name)
};

async function runFromCommandLine(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is required to run the Workspace migration.");
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5_000, autoIndex: false });
  try {
    const apply = process.argv.includes("--apply");
    const plan = await migrateWorkspaceOwners(repository, apply);
    console.info(JSON.stringify({ mode: apply ? "apply" : "dry-run", ...plan }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  void runFromCommandLine().catch((error: unknown) => {
    console.error("Workspace migration failed:", error instanceof Error ? error.message : "unknown error");
    process.exitCode = 1;
  });
}
