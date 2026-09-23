import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ membership: null as Record<string, unknown> | null, workspace: null as Record<string, unknown> | null }));
vi.mock("../models/workspace-member.model.js", () => ({ WorkspaceMemberModel: {
  findOne: (filter: { workspaceId?: string }) => {
    const query = { sort: () => query, lean: async () => db.membership && (!filter.workspaceId || filter.workspaceId === db.membership.workspaceId) ? db.membership : null };
    return query;
  },
  find: () => ({ limit: () => ({ lean: async () => db.membership ? [db.membership] : [] }) })
} }));
vi.mock("../models/workspace.model.js", () => ({ WorkspaceModel: {
  findById: () => ({ select: () => ({ lean: async () => db.workspace }) })
} }));
vi.mock("../services/workspace.service.js", () => ({ workspaceService: { ensurePersonalWorkspace: vi.fn() } }));

import { resolveWorkspaceContext } from "./workspace.middleware.js";

function request(workspaceId?: string) {
  return { auth: { id: "507f1f77bcf86cd799439022" }, header: () => workspaceId } as never;
}

describe("Workspace request context", () => {
  beforeEach(() => {
    db.membership = { workspaceId: "507f1f77bcf86cd799439011", userId: "507f1f77bcf86cd799439022", role: "staff", allowedPages: ["page-a"] };
    db.workspace = { ownerUserId: "507f1f77bcf86cd799439033" };
  });

  it("resolves an explicitly selected membership and its Page scope", async () => {
    const req = request("507f1f77bcf86cd799439011") as { workspace?: unknown };
    const next = vi.fn();
    await resolveWorkspaceContext(req as never, {} as never, next);
    expect(req.workspace).toEqual({ id: "507f1f77bcf86cd799439011", ownerUserId: "507f1f77bcf86cd799439033", role: "staff", allowedPages: ["page-a"] });
    expect(next).toHaveBeenCalledWith();
  });

  it("rejects a Workspace ID when the user has no membership", async () => {
    db.membership = null;
    const next = vi.fn();
    await resolveWorkspaceContext(request("507f1f77bcf86cd799439044") as never, {} as never, next);
    expect(next.mock.calls[0]?.[0]).toMatchObject({ statusCode: 403, code: "WORKSPACE_MEMBERSHIP_REQUIRED" });
  });
});
