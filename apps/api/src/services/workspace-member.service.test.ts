import { describe, expect, it } from "vitest";

import { personalSessionWorkspaceChannels, WorkspaceMemberService, type WorkspaceChannelView, type WorkspaceMemberDependencies, type WorkspaceMembership, type WorkspaceMemberView } from "./workspace-member.service.js";

function fixture() {
  const memberships = new Map<string, WorkspaceMembership>([
    ["workspace-1:owner-1", { workspaceId: "workspace-1", userId: "owner-1", role: "owner", allowedPages: [] }],
    ["workspace-2:owner-2", { workspaceId: "workspace-2", userId: "owner-2", role: "owner", allowedPages: [] }],
    ["workspace-2:staff-1", { workspaceId: "workspace-2", userId: "staff-1", role: "staff", allowedPages: [] }]
  ]);
  const views: WorkspaceMemberView[] = [];
  const channels: WorkspaceChannelView[] = [
    { platform: "facebook", channelId: "page-1", name: "Page Một" },
    { platform: "telegram", channelId: "chat-1", name: "Nhóm Telegram" },
    { platform: "zalo_personal", channelId: "owner-1", name: "Chủ Zalo", displayId: "zalo-account-1" },
    { platform: "telegram_personal", channelId: "owner-1", name: "Chủ Telegram", displayId: "telegram-account-1" }
  ];
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
    channels: {
      async listOwned(ownerUserId) { return ownerUserId === "owner-1" ? channels : []; },
      async findOwned(ownerUserId, refs) {
        const owned = new Set(ownerUserId === "owner-1" ? channels.map((item) => `${item.platform}:${item.channelId}`) : []);
        return refs.filter((item) => owned.has(`${item.platform}:${item.channelId}`));
      }
    }
  };
  return { service: new WorkspaceMemberService(dependencies), memberships };
}

describe("WorkspaceMemberService", () => {
  it("lists connected personal accounts with safe display identities and owner-bound access keys", () => {
    expect(personalSessionWorkspaceChannels("owner-1", {
      zalo: { zaloUserId: "zalo-id", displayName: "Zalo Owner", avatarUrl: "https://cdn.test/zalo.png" },
      telegram: { telegramUserId: "telegram-id", displayName: "Telegram Owner", username: "owner", avatarUrl: null }
    })).toEqual([
      { platform: "zalo_personal", channelId: "owner-1", name: "Zalo Owner", displayId: "zalo-id", avatarUrl: "https://cdn.test/zalo.png" },
      { platform: "telegram_personal", channelId: "owner-1", name: "Telegram Owner", displayId: "telegram-id" }
    ]);
    expect(personalSessionWorkspaceChannels("owner-1", {})).toEqual([]);
  });

  it("requires an existing account and accepts a user who has another Workspace membership", async () => {
    const { service, memberships } = fixture();
    await expect(service.addMember("workspace-1", "owner-1", {
      email: "missing@example.com", role: "staff", allowedPages: []
    })).rejects.toMatchObject({ statusCode: 400, message: "Tài khoản không tồn tại, yêu cầu đăng ký trước" });

    const result = await service.addMember("workspace-1", "owner-1", {
      email: " STAFF@example.com ", role: "staff", allowedChannels: [{ platform: "facebook", channelId: "page-1" }]
    });
    expect(result.member).toMatchObject({ userId: "staff-1", role: "staff", allowedPages: ["page-1"], allowedChannels: [{ platform: "facebook", channelId: "page-1" }] });
    expect(memberships.has("workspace-1:staff-1")).toBe(true);
  });

  it("rejects non-owner management and Page ids outside the Workspace", async () => {
    const { service } = fixture();
    await expect(service.addMember("workspace-1", "owner-2", {
      email: "staff@example.com", role: "staff", allowedPages: []
    })).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.addMember("workspace-1", "owner-1", {
      email: "staff@example.com", role: "staff", allowedChannels: [{ platform: "telegram", channelId: "foreign-chat" }]
    })).rejects.toMatchObject({ statusCode: 400, code: "WORKSPACE_CHANNEL_ACCESS_INVALID" });
  });

  it("allows assigning a connected personal account by Workspace owner identity", async () => {
    const { service } = fixture();
    await expect(service.addMember("workspace-1", "owner-1", {
      email: "staff@example.com", role: "staff", allowedChannels: [{ platform: "zalo_personal", channelId: "owner-1" }]
    })).resolves.toMatchObject({ member: { allowedChannels: [{ platform: "zalo_personal", channelId: "owner-1" }] } });
  });

  it("keeps the owner immutable and gives admins unrestricted Page access", async () => {
    const { service } = fixture();
    await expect(service.removeMember("workspace-1", "owner-1", "owner-1"))
      .rejects.toMatchObject({ statusCode: 409, code: "WORKSPACE_OWNER_IMMUTABLE" });
    await expect(service.addMember("workspace-1", "owner-1", {
      email: "staff@example.com", role: "admin", allowedChannels: [{ platform: "facebook", channelId: "page-1" }]
    })).resolves.toMatchObject({ member: { role: "admin", allowedPages: [] } });
  });

  it("lists all shared channels for the owner and only the assigned platform/channel pair for staff", async () => {
    const { service } = fixture();
    await expect(service.listChannels("workspace-1", "owner-1")).resolves.toMatchObject({ channels: [
      { platform: "facebook", channelId: "page-1" },
      { platform: "telegram", channelId: "chat-1" },
      { platform: "zalo_personal", channelId: "owner-1", displayId: "zalo-account-1" },
      { platform: "telegram_personal", channelId: "owner-1", displayId: "telegram-account-1" }
    ] });
    const fixtureWithRestrictedMember = fixture();
    await fixtureWithRestrictedMember.service.addMember("workspace-1", "owner-1", {
      email: "staff@example.com", role: "staff", allowedChannels: [{ platform: "telegram", channelId: "chat-1" }]
    });
    await expect(fixtureWithRestrictedMember.service.listChannels("workspace-1", "staff-1"))
      .resolves.toMatchObject({ channels: [{ platform: "telegram", channelId: "chat-1" }] });
  });
});
