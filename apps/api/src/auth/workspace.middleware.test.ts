import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ membership: null as Record<string, unknown> | null, workspace: null as Record<string, unknown> | null }));
const instagram = vi.hoisted(() => ({ rows: [] as Array<{ instagramUserId: string }> }));
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
const instagramConnection = vi.hoisted(() => ({ find: vi.fn() }));
vi.mock("../models/instagram-account-connection.model.js", () => ({ InstagramAccountConnectionModel: instagramConnection }));
vi.mock("../services/workspace.service.js", () => ({ workspaceService: { ensurePersonalWorkspace: vi.fn() } }));

import { resolveWorkspaceContext } from "./workspace.middleware.js";

function request(workspaceId?: string) {
  return { auth: { id: "507f1f77bcf86cd799439022" }, header: () => workspaceId } as never;
}

describe("Workspace request context", () => {
  beforeEach(() => {
    db.membership = { workspaceId: "507f1f77bcf86cd799439011", userId: "507f1f77bcf86cd799439022", role: "staff", allowedPages: ["page-a"] };
    db.workspace = { ownerUserId: "507f1f77bcf86cd799439033" };
    instagram.rows = [{ instagramUserId: "ig-active" }];
    instagramConnection.find.mockReturnValue({ select: () => ({ lean: async () => instagram.rows }) });
  });

  it("resolves an explicitly selected membership and its Page scope", async () => {
    const req = request("507f1f77bcf86cd799439011") as { workspace?: unknown };
    const next = vi.fn();
    await resolveWorkspaceContext(req as never, {} as never, next);
    expect(req.workspace).toEqual({ id: "507f1f77bcf86cd799439011", ownerUserId: "507f1f77bcf86cd799439033", role: "staff", allowedPages: ["page-a"], allowedChannels: [{ platform: "facebook", channelId: "page-a" }], revokedChannels: [], activeInstagramChannelIds: ["ig-active"] });
    expect(instagramConnection.find).toHaveBeenCalledWith({ ownerUserId: "507f1f77bcf86cd799439033", status: "connected" });
    expect(next).toHaveBeenCalledWith();
  });

  it("keeps Facebook access empty when a staff member is limited to another platform", async () => {
    db.membership = {
      workspaceId: "507f1f77bcf86cd799439011", userId: "507f1f77bcf86cd799439022", role: "staff",
      allowedPages: [], allowedChannels: [{ platform: "telegram", channelId: "chat-1" }],
      revokedChannels: [{ platform: "instagram", channelId: "ig-disconnected" }]
    };
    const req = request("507f1f77bcf86cd799439011") as { workspace?: { allowedPages: string[] | null; revokedChannels: Array<{ platform: string; channelId: string }> } };
    await resolveWorkspaceContext(req as never, {} as never, vi.fn());
    expect(req.workspace?.allowedPages).toEqual([]);
    expect(req.workspace?.revokedChannels).toEqual([{ platform: "instagram", channelId: "ig-disconnected" }]);
  });

  it("rejects a Workspace ID when the user has no membership", async () => {
    db.membership = null;
    const next = vi.fn();
    await resolveWorkspaceContext(request("507f1f77bcf86cd799439044") as never, {} as never, next);
    expect(next.mock.calls[0]?.[0]).toMatchObject({ statusCode: 403, code: "WORKSPACE_MEMBERSHIP_REQUIRED" });
  });

  it("does not turn an empty Staff allowlist into access to historical disconnected Instagram accounts", async () => {
    db.membership = { workspaceId: "507f1f77bcf86cd799439011", userId: "507f1f77bcf86cd799439022", role: "staff", allowedChannels: [] };
    instagram.rows = [];
    const req = request("507f1f77bcf86cd799439011") as { workspace?: { activeInstagramChannelIds: string[]; allowedChannels: unknown[] } };
    await resolveWorkspaceContext(req as never, {} as never, vi.fn());
    expect(req.workspace?.allowedChannels).toEqual([]);
    expect(req.workspace?.activeInstagramChannelIds).toEqual([]);
  });
});
