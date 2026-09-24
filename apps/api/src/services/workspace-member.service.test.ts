import { describe, expect, it } from "vitest";

import { WorkspaceMemberService, type WorkspaceMemberDependencies, type WorkspaceMembership, type WorkspaceMemberView } from "./workspace-member.service.js";

function fixture() {
  const memberships = new Map<string, WorkspaceMembership>([
    ["workspace-1:owner-1", { workspaceId: "workspace-1", userId: "owner-1", role: "owner", allowedPages: [] }],
    ["workspace-2:owner-2", { workspaceId: "workspace-2", userId: "owner-2", role: "owner", allowedPages: [] }],
    ["workspace-2:staff-1", { workspaceId: "workspace-2", userId: "staff-1", role: "staff", allowedPages: [] }]
  ]);
  const views: WorkspaceMemberView[] = [];
  const dependencies: WorkspaceMemberDependencies = {
    users: {
      async findByEmail(email) {
        return email === "staff@example.com" ? { id: "staff-1", email, name: "Staff" } : null;
      }
    },
    workspaces: {
      async findById(workspaceId) {
        return workspaceId === "workspace-1" ? { id: workspaceId, ownerUserId: "owner-1", name: "Team" } : null;
      }
    },
    memberships: {
      async find(workspaceId, userId) { return memberships.get(`${workspaceId}:${userId}`) ?? null; },
      async list() { return views; },
      async listForUser() { return []; },
      async create(input) { memberships.set(`${input.workspaceId}:${input.userId}`, input); },
      async update(workspaceId, userId, patch) {
        const key = `${workspaceId}:${userId}`;
        const current = memberships.get(key);
        if (current) memberships.set(key, { ...current, ...patch });
      },
      async remove(workspaceId, userId) { memberships.delete(`${workspaceId}:${userId}`); }
    },
    pages: {
      async findOwned(ownerUserId, pageIds) { return ownerUserId === "owner-1" ? pageIds.filter((id) => id === "page-1") : []; }
    }
  };
  return { service: new WorkspaceMemberService(dependencies), memberships };
}

describe("WorkspaceMemberService", () => {
  it("requires an existing account and accepts a user who has another Workspace membership", async () => {
    const { service, memberships } = fixture();
    await expect(service.addMember("workspace-1", "owner-1", {
      email: "missing@example.com", role: "staff", allowedPages: []
    })).rejects.toMatchObject({ statusCode: 400, message: "Tài khoản không tồn tại, yêu cầu đăng ký trước" });

    const result = await service.addMember("workspace-1", "owner-1", {
      email: " STAFF@example.com ", role: "staff", allowedPages: ["page-1"]
    });
    expect(result.member).toMatchObject({ userId: "staff-1", role: "staff", allowedPages: ["page-1"] });
    expect(memberships.has("workspace-1:staff-1")).toBe(true);
  });

  it("rejects non-owner management and Page ids outside the Workspace", async () => {
    const { service } = fixture();
    await expect(service.addMember("workspace-1", "owner-2", {
      email: "staff@example.com", role: "staff", allowedPages: []
    })).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.addMember("workspace-1", "owner-1", {
      email: "staff@example.com", role: "staff", allowedPages: ["foreign-page"]
    })).rejects.toMatchObject({ statusCode: 400, code: "WORKSPACE_PAGE_ACCESS_INVALID" });
  });

  it("keeps the owner immutable and gives admins unrestricted Page access", async () => {
    const { service } = fixture();
    await expect(service.removeMember("workspace-1", "owner-1", "owner-1"))
      .rejects.toMatchObject({ statusCode: 409, code: "WORKSPACE_OWNER_IMMUTABLE" });
    await expect(service.addMember("workspace-1", "owner-1", {
      email: "staff@example.com", role: "admin", allowedPages: ["page-1"]
    })).resolves.toMatchObject({ member: { role: "admin", allowedPages: [] } });
  });
});
