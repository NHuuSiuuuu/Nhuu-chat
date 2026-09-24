import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ workspaceFindOne: vi.fn(), memberFind: vi.fn(), memberUpdateMany: vi.fn() }));

vi.mock("../models/workspace.model.js", () => ({ WorkspaceModel: { findOne: mocks.workspaceFindOne } }));
vi.mock("../models/workspace-member.model.js", () => ({ WorkspaceMemberModel: { find: mocks.memberFind, updateMany: mocks.memberUpdateMany } }));

import { clearWorkspaceChannelRevocation, revokeWorkspaceChannel } from "./workspace-channel-revocation.service.js";

describe("Workspace channel revocation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.workspaceFindOne.mockReturnValue({ select: () => ({ lean: async () => ({ _id: "workspace-1" }) }) });
    mocks.memberFind.mockReturnValue({ select: () => ({ lean: async () => [{ userId: "staff-1" }, { userId: "staff-2" }] }) });
    mocks.memberUpdateMany.mockResolvedValue({ matchedCount: 2, modifiedCount: 2 });
  });

  it("denies only the disconnected channel for every Workspace staff member", async () => {
    await expect(revokeWorkspaceChannel("owner-1", { platform: "instagram", channelId: "ig-1" })).resolves.toEqual({
      workspaceId: "workspace-1", memberUserIds: ["staff-1", "staff-2"]
    });
    expect(mocks.memberFind).toHaveBeenCalledWith({ workspaceId: "workspace-1", role: "staff" });
    expect(mocks.memberUpdateMany).toHaveBeenCalledWith(
      { workspaceId: "workspace-1", role: "staff" },
      { $addToSet: { revokedChannels: { platform: "instagram", channelId: "ig-1" } } }
    );
  });

  it("clears only the exact revocation when that same account reconnects", async () => {
    mocks.memberFind.mockReturnValue({ select: () => ({ lean: async () => [{ userId: "staff-1" }] }) });
    await expect(clearWorkspaceChannelRevocation("owner-1", { platform: "instagram", channelId: "ig-1" })).resolves.toEqual({
      workspaceId: "workspace-1", memberUserIds: ["staff-1"]
    });
    expect(mocks.memberFind).toHaveBeenCalledWith({
      workspaceId: "workspace-1", role: "staff", revokedChannels: { $elemMatch: { platform: "instagram", channelId: "ig-1" } }
    });
    expect(mocks.memberUpdateMany).toHaveBeenCalledWith(
      { workspaceId: "workspace-1", role: "staff", revokedChannels: { $elemMatch: { platform: "instagram", channelId: "ig-1" } } },
      { $pull: { revokedChannels: { platform: "instagram", channelId: "ig-1" } } }
    );
  });
});
