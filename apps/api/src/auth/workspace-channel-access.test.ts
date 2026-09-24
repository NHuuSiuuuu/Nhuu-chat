import { describe, expect, it } from "vitest";

import { effectiveAllowedChannels, effectiveRevokedChannels, isWorkspaceChannelPlatform, workspaceChannelAccessFilter } from "./workspace-channel-access.js";

describe("workspace channel access", () => {
  it("normalizes legacy Facebook Page permissions without granting a matching ID on another platform", () => {
    expect(effectiveAllowedChannels({ allowedPages: ["shared-id"] })).toEqual([
      { platform: "facebook", channelId: "shared-id" }
    ]);
  });

  it("uses unique platform and channel pairs from the new membership field", () => {
    expect(effectiveAllowedChannels({ allowedChannels: [
      { platform: "facebook", channelId: "shared-id" },
      { platform: "telegram", channelId: "shared-id" },
      { platform: "telegram", channelId: "shared-id" }
    ] })).toEqual([
      { platform: "facebook", channelId: "shared-id" },
      { platform: "telegram", channelId: "shared-id" }
    ]);
  });

  it("uses the empty selection as all shared Workspace channels", () => {
    expect(workspaceChannelAccessFilter("owner-1", [])).toEqual({
      ownerId: "owner-1",
      platform: { $in: ["facebook", "instagram", "zalo", "telegram", "zalo_personal", "telegram_personal"] }
    });
  });

  it("requires an exact grant for Instagram even when other channels are unrestricted", () => {
    expect(workspaceChannelAccessFilter("owner-1", [], [], ["ig-active"])).toEqual({ ownerId: "owner-1", platform: { $in: ["facebook", "zalo", "telegram", "zalo_personal", "telegram_personal"] } });
    expect(workspaceChannelAccessFilter("owner-1", [], [], [])).toEqual({
      ownerId: "owner-1", platform: { $in: ["facebook", "zalo", "telegram", "zalo_personal", "telegram_personal"] }
    });
  });

  it("keeps Instagram out of the unrestricted staff filter while retaining an exact grant", () => {
    expect(workspaceChannelAccessFilter("owner-1", [
      { platform: "instagram", channelId: "ig-active" }, { platform: "telegram", channelId: "chat-1" }
    ], [], ["ig-active"])).toEqual({ $or: [
      { ownerId: "owner-1", platform: "instagram", channelId: "ig-active" },
      { ownerId: "owner-1", platform: "telegram", channelId: "chat-1" }
    ] });
  });

  it("removes explicitly granted Instagram channels from the REST scope when disconnected", () => {
    expect(workspaceChannelAccessFilter("owner-1", [
      { platform: "instagram", channelId: "ig-gone" },
      { platform: "telegram", channelId: "chat-1" }
    ], [], ["ig-active"])).toEqual({
      ownerId: "owner-1", platform: "telegram", channelId: "chat-1"
    });
  });

  it("filters by owner, platform, and channel ID for selected channels", () => {
    expect(workspaceChannelAccessFilter("owner-1", [
      { platform: "facebook", channelId: "shared-id" },
      { platform: "telegram", channelId: "shared-id" }
    ])).toEqual({ $or: [
      { ownerId: "owner-1", platform: "facebook", channelId: "shared-id" },
      { ownerId: "owner-1", platform: "telegram", channelId: "shared-id" }
    ] });
  });

  it("recognizes personal Zalo and Telegram sessions as Workspace channels", () => {
    expect(effectiveAllowedChannels({ allowedChannels: [
      { platform: "zalo_personal", channelId: "owner-1" },
      { platform: "telegram_personal", channelId: "owner-1" }
    ] })).toEqual([
      { platform: "zalo_personal", channelId: "owner-1" },
      { platform: "telegram_personal", channelId: "owner-1" }
    ]);
    expect(isWorkspaceChannelPlatform("zalo_personal")).toBe(true);
    expect(isWorkspaceChannelPlatform("telegram_personal")).toBe(true);
  });

  it("scopes personal session access to conversations owned by that Workspace owner", () => {
    expect(workspaceChannelAccessFilter("owner-1", [
      { platform: "telegram_personal", channelId: "owner-1" }
    ])).toEqual({ ownerId: "owner-1", platform: "telegram_personal" });
  });

  it("keeps an exact revoked channel denied without changing unrestricted access to other channels", () => {
    const revoked = effectiveRevokedChannels({ revokedChannels: [
      { platform: "instagram", channelId: "ig-disconnected" },
      { platform: "instagram", channelId: "ig-disconnected" }
    ] });
    expect(revoked).toEqual([{ platform: "instagram", channelId: "ig-disconnected" }]);
    expect(workspaceChannelAccessFilter("owner-1", [], revoked)).toEqual({ $and: [
      { ownerId: "owner-1", platform: { $in: ["facebook", "instagram", "zalo", "telegram", "zalo_personal", "telegram_personal"] } },
      { $nor: [{ ownerId: "owner-1", platform: "instagram", channelId: "ig-disconnected" }] }
    ] });
  });
});
