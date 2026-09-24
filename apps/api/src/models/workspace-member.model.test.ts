import mongoose from "mongoose";
import { describe, expect, it } from "vitest";

import { WorkspaceMemberModel, workspaceRoles } from "./workspace-member.model.js";

describe("Workspace member model", () => {
  it("stores role and Page access with an empty Page list by default", () => {
    const member = new WorkspaceMemberModel({
      workspaceId: new mongoose.Types.ObjectId(), userId: new mongoose.Types.ObjectId(), role: "staff"
    });
    expect(member.allowedPages).toEqual([]);
    expect(member.allowedChannels).toBeUndefined();
    expect(member.revokedChannels).toEqual([]);
    expect(workspaceRoles).toEqual(["owner", "admin", "staff"]);
  });

  it("allows one membership per user and one owner per Workspace", () => {
    expect(WorkspaceMemberModel.schema.indexes()).toContainEqual([
      { workspaceId: 1, userId: 1 }, expect.objectContaining({ unique: true })
    ]);
    expect(WorkspaceMemberModel.schema.indexes()).toContainEqual([
      { workspaceId: 1 }, expect.objectContaining({ unique: true, partialFilterExpression: { role: "owner" } })
    ]);
  });

  it("accepts assigned personal Zalo and Telegram account channel references", async () => {
    const member = new WorkspaceMemberModel({
      workspaceId: new mongoose.Types.ObjectId(), userId: new mongoose.Types.ObjectId(), role: "staff",
      allowedChannels: [
        { platform: "zalo_personal", channelId: "owner-1" },
        { platform: "telegram_personal", channelId: "owner-1" }
      ]
    });
    await expect(member.validate()).resolves.toBeUndefined();
    expect(member.allowedChannels).toHaveLength(2);
  });

  it("stores exact revoked Instagram channels without replacing the member grants", async () => {
    const member = new WorkspaceMemberModel({
      workspaceId: new mongoose.Types.ObjectId(), userId: new mongoose.Types.ObjectId(), role: "staff",
      allowedChannels: [{ platform: "instagram", channelId: "ig-1" }],
      revokedChannels: [{ platform: "instagram", channelId: "ig-1" }]
    });
    await expect(member.validate()).resolves.toBeUndefined();
    expect(member.allowedChannels?.map((channel: { platform: string; channelId: string }) => ({ platform: channel.platform, channelId: channel.channelId })))
      .toEqual([{ platform: "instagram", channelId: "ig-1" }]);
    expect(member.revokedChannels?.map((channel: { platform: string; channelId: string }) => ({ platform: channel.platform, channelId: channel.channelId })))
      .toEqual([{ platform: "instagram", channelId: "ig-1" }]);
  });
});
