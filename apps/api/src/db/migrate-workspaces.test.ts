import { describe, expect, it, vi } from "vitest";

import { buildWorkspaceBootstrapPlan, migrateWorkspaceOwners, type WorkspaceBootstrapRepository } from "./migrate-workspaces.js";

describe("Workspace migration", () => {
  it("reports missing personal Workspaces and owner memberships without writes", async () => {
    const users = [{ id: "user-1", name: "Owner" }, { id: "user-2", name: "Legacy" }];
    const repository: WorkspaceBootstrapRepository = {
      ensureIndexes: vi.fn(),
      listUsers: vi.fn().mockResolvedValue(users),
      listWorkspaces: vi.fn().mockResolvedValue([{ id: "workspace-1", ownerUserId: "user-1" }]),
      listOwnerMemberships: vi.fn().mockResolvedValue([]),
      ensurePersonalWorkspace: vi.fn()
    };

    await expect(migrateWorkspaceOwners(repository)).resolves.toEqual({
      workspaceUsersToCreate: ["user-2"],
      ownerMembershipsToCreate: [{ workspaceId: "workspace-1", userId: "user-1" }]
    });
    expect(repository.ensurePersonalWorkspace).not.toHaveBeenCalled();
    expect(repository.ensureIndexes).not.toHaveBeenCalled();
  });

  it("repairs every account when explicitly applied and produces an empty plan on rerun", async () => {
    const plan = buildWorkspaceBootstrapPlan(
      [{ id: "user-1", name: "Owner" }],
      [{ id: "workspace-1", ownerUserId: "user-1" }],
      [{ workspaceId: "workspace-1", userId: "user-1", role: "owner" }]
    );
    expect(plan).toEqual({ workspaceUsersToCreate: [], ownerMembershipsToCreate: [] });

    const repository: WorkspaceBootstrapRepository = {
      ensureIndexes: vi.fn(),
      listUsers: vi.fn().mockResolvedValue([{ id: "user-1", name: "Owner" }]),
      listWorkspaces: vi.fn().mockResolvedValue([]),
      listOwnerMemberships: vi.fn().mockResolvedValue([]),
      ensurePersonalWorkspace: vi.fn()
    };
    await migrateWorkspaceOwners(repository, true);
    expect(repository.ensureIndexes).toHaveBeenCalledOnce();
    expect(repository.ensurePersonalWorkspace).toHaveBeenCalledWith("user-1", "Owner");
  });
});
