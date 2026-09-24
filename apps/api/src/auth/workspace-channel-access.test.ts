import { describe, expect, it } from "vitest";

import { effectiveAllowedChannels, isWorkspaceChannelPlatform, workspaceChannelAccessFilter } from "./workspace-channel-access.js";

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
});
