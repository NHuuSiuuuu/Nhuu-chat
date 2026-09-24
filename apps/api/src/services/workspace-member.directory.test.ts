import { beforeEach, describe, expect, it, vi } from "vitest";

const directoryMocks = vi.hoisted(() => ({
  membershipFindOne: vi.fn(), workspaceFindById: vi.fn(), facebookFind: vi.fn(), conversationAggregate: vi.fn(),
  telegramFindOne: vi.fn(), zaloFindOne: vi.fn(), instagramFind: vi.fn()
}));

vi.mock("../models/workspace-member.model.js", () => ({ WorkspaceMemberModel: { findOne: directoryMocks.membershipFindOne } }));
vi.mock("../models/workspace.model.js", () => ({ WorkspaceModel: { findById: directoryMocks.workspaceFindById } }));
vi.mock("../models/facebook-page-connection.model.js", () => ({ FacebookPageConnectionModel: { find: directoryMocks.facebookFind } }));
vi.mock("../models/instagram-account-connection.model.js", () => ({ InstagramAccountConnectionModel: { find: directoryMocks.instagramFind } }));
vi.mock("../models/conversation.model.js", () => ({ ConversationModel: { aggregate: directoryMocks.conversationAggregate } }));
vi.mock("../channels/telegram-personal/telegram-personal.model.js", () => ({ TelegramPersonalSessionModel: { findOne: directoryMocks.telegramFindOne } }));
vi.mock("../channels/zalo-personal/zalo-personal.model.js", () => ({ ZaloPersonalSessionModel: { findOne: directoryMocks.zaloFindOne } }));

import { WorkspaceMemberService } from "./workspace-member.service.js";

function selectedQuery(value: unknown) {
  const query = { select: vi.fn(() => query), lean: vi.fn().mockResolvedValue(value) };
  return query;
}

describe("Workspace channel directory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    directoryMocks.membershipFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue({
      workspaceId: "workspace-1", userId: "owner-1", role: "owner", allowedPages: []
    }) });
    directoryMocks.workspaceFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue({
      _id: "workspace-1", ownerUserId: "owner-1", name: "Team"
    }) });
    directoryMocks.facebookFind.mockReturnValue(selectedQuery([]));
    directoryMocks.instagramFind.mockReturnValue(selectedQuery([]));
    directoryMocks.conversationAggregate.mockResolvedValue([]);
    directoryMocks.telegramFindOne.mockReturnValue(selectedQuery(null));
    directoryMocks.zaloFindOne.mockReturnValue(selectedQuery(null));
  });

  it("lists only connected owner sessions and leaves encrypted credentials unselected", async () => {
    directoryMocks.telegramFindOne.mockReturnValue(selectedQuery({
      telegramUserId: "tg-remote-id", displayName: "Telegram Owner", username: "owner", avatarUrl: "https://cdn.test/tg.png"
    }));
    directoryMocks.zaloFindOne.mockReturnValue(selectedQuery({
      zaloUserId: "zalo-remote-id", displayName: "Zalo Owner", avatarUrl: "https://cdn.test/zalo.png"
    }));

    const result = await new WorkspaceMemberService().listChannels("workspace-1", "owner-1");

    expect(result.channels).toContainEqual({
      platform: "telegram_personal", channelId: "owner-1", name: "Telegram Owner",
      displayId: "tg-remote-id", avatarUrl: "https://cdn.test/tg.png"
    });
    expect(result.channels).toContainEqual({
      platform: "zalo_personal", channelId: "owner-1", name: "Zalo Owner",
      displayId: "zalo-remote-id", avatarUrl: "https://cdn.test/zalo.png"
    });
    expect(directoryMocks.telegramFindOne).toHaveBeenCalledWith({ userId: "owner-1", status: "active" });
    expect(directoryMocks.zaloFindOne).toHaveBeenCalledWith({ ownerId: "owner-1", status: "connected", lastErrorCode: null });
    expect(directoryMocks.telegramFindOne.mock.results[0]?.value.select).toHaveBeenCalledWith("telegramUserId displayName username avatarUrl");
    expect(directoryMocks.zaloFindOne.mock.results[0]?.value.select).toHaveBeenCalledWith("zaloUserId displayName avatarUrl");
  });

  it("does not list personal accounts without active connected sessions", async () => {
    await expect(new WorkspaceMemberService().listChannels("workspace-1", "owner-1"))
      .resolves.toMatchObject({ channels: [] });
  });

  it("does not restore a disconnected Instagram account from historical conversations", async () => {
    directoryMocks.conversationAggregate.mockResolvedValue([
      { _id: { platform: "instagram", channelId: "ig-disconnected" }, name: "Old Shop" }
    ]);

    const result = await new WorkspaceMemberService().listChannels("workspace-1", "owner-1");

    expect(result.channels).not.toContainEqual({
      platform: "instagram", channelId: "ig-disconnected", name: "Old Shop"
    });
  });

  it("lists every connected Instagram account with its public identity only", async () => {
    directoryMocks.instagramFind.mockReturnValue(selectedQuery([
      { instagramUserId: "ig-1", username: "first", displayName: "First Shop", avatarUrl: "https://cdn.test/ig-1.png" },
      { instagramUserId: "ig-2", username: "second", displayName: "Second Shop", avatarUrl: null }
    ]));

    const result = await new WorkspaceMemberService().listChannels("workspace-1", "owner-1");

    expect(result.channels).toContainEqual({ platform: "instagram", channelId: "ig-1", name: "First Shop", avatarUrl: "https://cdn.test/ig-1.png" });
    expect(result.channels).toContainEqual({ platform: "instagram", channelId: "ig-2", name: "Second Shop" });
    expect(directoryMocks.instagramFind).toHaveBeenCalledWith({ ownerUserId: "owner-1", status: "connected" });
    expect(directoryMocks.instagramFind.mock.results[0]?.value.select).toHaveBeenCalledWith("instagramUserId username displayName avatarUrl");
  });

  it("filters connected Instagram directory entries to the staff channel grant", async () => {
    directoryMocks.membershipFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue({
      workspaceId: "workspace-1", userId: "staff-1", role: "staff", allowedChannels: [{ platform: "instagram", channelId: "ig-2" }]
    }) });
    directoryMocks.instagramFind.mockReturnValue(selectedQuery([
      { instagramUserId: "ig-1", displayName: "First Shop" }, { instagramUserId: "ig-2", displayName: "Second Shop" }
    ]));

    const result = await new WorkspaceMemberService().listChannels("workspace-1", "staff-1");

    expect(result.channels).toEqual([{ platform: "instagram", channelId: "ig-2", name: "Second Shop" }]);
  });

  it("hides Instagram from unrestricted staff channel directory", async () => {
    directoryMocks.membershipFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue({
      workspaceId: "workspace-1", userId: "staff-1", role: "staff", allowedChannels: []
    }) });
    directoryMocks.instagramFind.mockReturnValue(selectedQuery([{ instagramUserId: "ig-1", username: "first" }]));
    const result = await new WorkspaceMemberService().listChannels("workspace-1", "staff-1");
    expect(result.channels.filter((channel) => channel.platform === "instagram")).toEqual([]);
  });

  it("lets Workspace admins see every connected Instagram channel", async () => {
    directoryMocks.membershipFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue({
      workspaceId: "workspace-1", userId: "admin-1", role: "admin", allowedChannels: []
    }) });
    directoryMocks.instagramFind.mockReturnValue(selectedQuery([
      { instagramUserId: "ig-1", username: "first" }, { instagramUserId: "ig-2", username: "second" }
    ]));

    const result = await new WorkspaceMemberService().listChannels("workspace-1", "admin-1");

    expect(result.channels.filter((channel) => channel.platform === "instagram")).toEqual([
      { platform: "instagram", channelId: "ig-1", name: "first" },
      { platform: "instagram", channelId: "ig-2", name: "second" }
    ]);
  });
});
