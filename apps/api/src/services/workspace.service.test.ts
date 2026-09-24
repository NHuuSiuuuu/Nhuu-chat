import { describe, expect, it, vi } from "vitest";

import { WorkspaceService, type WorkspaceMembershipRepository, type WorkspaceRecord, type WorkspaceRepository } from "./workspace.service.js";

describe("WorkspaceService.ensurePersonalWorkspace", () => {
  it("creates an owner membership for the personal Workspace", async () => {
    const workspace: WorkspaceRecord = { id: "workspace-1", ownerUserId: "user-1", name: "Nhuu" };
    const workspaces: WorkspaceRepository = {
      findByOwnerUserId: vi.fn().mockResolvedValueOnce(null), create: vi.fn().mockResolvedValue(workspace)
    };
    const memberships: WorkspaceMembershipRepository = { ensureOwner: vi.fn() };
    const service = new WorkspaceService(workspaces, memberships);

    await expect(service.ensurePersonalWorkspace("user-1", "Nhuu")).resolves.toEqual(workspace);
    expect(workspaces.create).toHaveBeenCalledWith({ ownerUserId: "user-1", name: "Nhuu" });
    expect(memberships.ensureOwner).toHaveBeenCalledWith("workspace-1", "user-1");
  });

  it("repairs owner membership without duplicating an existing Workspace", async () => {
    const workspace: WorkspaceRecord = { id: "workspace-1", ownerUserId: "user-1", name: "Nhuu" };
    const workspaces: WorkspaceRepository = {
      findByOwnerUserId: vi.fn().mockResolvedValue(workspace), create: vi.fn()
    };
    const memberships: WorkspaceMembershipRepository = { ensureOwner: vi.fn() };
    const service = new WorkspaceService(workspaces, memberships);

    await service.ensurePersonalWorkspace("user-1", "ignored");

    expect(workspaces.create).not.toHaveBeenCalled();
    expect(memberships.ensureOwner).toHaveBeenCalledWith("workspace-1", "user-1");
  });
});
