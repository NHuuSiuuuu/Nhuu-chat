import { describe, expect, it } from "vitest";

import { canJoinConversation, canMarkConversationRead, conversationAccessFilter } from "./access.js";

describe("conversation realtime access", () => {
  it("allows the owner of a personal Telegram conversation to join its room", () => {
    expect(canJoinConversation(
      { id: "user-1", role: "customer" },
      { ownerId: "user-1", assignedAgentId: null }
    )).toBe(true);
  });

  it("does not allow an unrelated customer to join the room", () => {
    expect(canJoinConversation(
      { id: "user-2", role: "customer" },
      { ownerId: "user-1", assignedAgentId: null }
    )).toBe(false);
  });

  it("only allows the conversation owner, assigned agent, or admin to mark it read", () => {
    expect(canMarkConversationRead({ id: "user-1", role: "customer" }, { ownerId: "user-2" })).toBe(false);
    expect(canMarkConversationRead({ id: "user-1", role: "customer" }, { ownerId: "user-1" })).toBe(true);
  });

  it("builds a conversation scope for each inbox role", () => {
    expect(conversationAccessFilter({ id: "user-1", role: "customer" })).toEqual({ ownerId: "user-1" });
    expect(conversationAccessFilter({ id: "agent-1", role: "agent" })).toEqual({ assignedAgentId: "agent-1" });
    expect(conversationAccessFilter({ id: "admin-1", role: "admin" })).toEqual({
      $or: [
        { platform: { $ne: "zalo_personal" } },
        { ownerId: "admin-1" },
        { assignedAgentId: "admin-1" }
      ]
    });
  });

  it("isolates Zalo personal rooms by owner while preserving admin access to existing platforms", () => {
    const admin = { id: "admin-2", role: "admin" };

    expect(canJoinConversation(admin, {
      platform: "zalo_personal",
      ownerId: "admin-1",
      assignedAgentId: null
    })).toBe(false);
    expect(canJoinConversation(admin, {
      platform: "zalo_personal",
      ownerId: "admin-1",
      assignedAgentId: "admin-2"
    })).toBe(true);
    expect(canJoinConversation(admin, {
      platform: "telegram",
      ownerId: "admin-1",
      assignedAgentId: null
    })).toBe(true);
  });

  it("limits Workspace staff to their owner's allowed Facebook Pages", () => {
    const staff = { id: "staff-1", role: "customer", workspace: { ownerUserId: "owner-1", allowedPages: ["page-a"] } };
    expect(canJoinConversation(staff, { platform: "facebook", ownerId: "owner-1", channelId: "page-a" })).toBe(true);
    expect(canJoinConversation(staff, { platform: "facebook", ownerId: "owner-1", channelId: "page-b" })).toBe(false);
    expect(canJoinConversation(staff, { platform: "facebook", ownerId: "owner-2", channelId: "page-a" })).toBe(false);
    expect(conversationAccessFilter(staff)).toEqual({ $or: [
      { platform: "facebook", ownerId: "owner-1", channelId: "page-a" },
      { platform: { $nin: ["facebook", "instagram", "zalo", "telegram", "zalo_personal", "telegram_personal"] }, ownerId: "staff-1" }
    ] });
  });

  it("limits Workspace staff by platform and channel ID and preserves personal account isolation", () => {
    const staff: Parameters<typeof canJoinConversation>[0] = { id: "staff-1", role: "customer", workspace: {
      ownerUserId: "owner-1", allowedPages: [], allowedChannels: [{ platform: "telegram" as const, channelId: "same-id" }]
    } };
    expect(canJoinConversation(staff, { platform: "telegram", ownerId: "owner-1", channelId: "same-id" })).toBe(true);
    expect(canJoinConversation(staff, { platform: "facebook", ownerId: "owner-1", channelId: "same-id" })).toBe(false);
    expect(canJoinConversation(staff, { platform: "telegram", ownerId: "owner-2", channelId: "same-id" })).toBe(false);
    expect(canJoinConversation(staff, { platform: "zalo_personal", ownerId: "owner-1", channelId: "same-id" })).toBe(false);
    expect(conversationAccessFilter(staff)).toEqual({ $or: [
      { ownerId: "owner-1", platform: "telegram", channelId: "same-id" },
      { platform: { $nin: ["facebook", "instagram", "zalo", "telegram", "zalo_personal", "telegram_personal"] }, ownerId: "staff-1" }
    ] });
  });

  it("grants staff realtime access only to the assigned Instagram account", () => {
    const staff = { id: "staff-1", role: "customer", workspace: {
      ownerUserId: "owner-1", allowedChannels: [{ platform: "instagram" as const, channelId: "ig-1" }]
    } };
    expect(canJoinConversation(staff, { platform: "instagram", ownerId: "owner-1", channelId: "ig-1" })).toBe(true);
    expect(canJoinConversation(staff, { platform: "instagram", ownerId: "owner-1", channelId: "ig-2" })).toBe(false);
    expect(canJoinConversation(staff, { platform: "instagram", ownerId: "owner-2", channelId: "ig-1" })).toBe(false);
    expect(conversationAccessFilter(staff)).toEqual({ $or: [
      { ownerId: "owner-1", platform: "instagram", channelId: "ig-1" },
      { platform: { $nin: ["facebook", "instagram", "zalo", "telegram", "zalo_personal", "telegram_personal"] }, ownerId: "staff-1" }
    ] });
  });

  it("denies an explicitly revoked Instagram channel while preserving unrestricted access to other channels", () => {
    const staff: Parameters<typeof canJoinConversation>[0] = { id: "staff-1", role: "customer", workspace: {
      ownerUserId: "owner-1", allowedChannels: [], allowedPages: [],
      revokedChannels: [{ platform: "instagram" as const, channelId: "ig-disconnected" }]
    } };
    expect(canJoinConversation(staff, { platform: "instagram", ownerId: "owner-1", channelId: "ig-disconnected" })).toBe(false);
    expect(canJoinConversation(staff, { platform: "instagram", ownerId: "owner-1", channelId: "ig-other" })).toBe(true);
    expect(canJoinConversation(staff, { platform: "telegram", ownerId: "owner-1", channelId: "chat-1" })).toBe(true);
    expect(conversationAccessFilter(staff)).toEqual({ $or: [
      { $and: [
        { ownerId: "owner-1", platform: { $in: ["facebook", "instagram", "zalo", "telegram", "zalo_personal", "telegram_personal"] } },
        { $nor: [{ ownerId: "owner-1", platform: "instagram", channelId: "ig-disconnected" }] }
      ] },
      { platform: { $nin: ["facebook", "instagram", "zalo", "telegram", "zalo_personal", "telegram_personal"] }, ownerId: "staff-1" }
    ] });
  });

  it("denies historical Instagram to unrestricted staff when the account is no longer connected", () => {
    const staff: Parameters<typeof canJoinConversation>[0] = { id: "staff-new", role: "customer", workspace: {
      role: "staff", ownerUserId: "owner-1", allowedChannels: [], activeInstagramChannelIds: [], revokedChannels: []
    } };
    expect(canJoinConversation(staff, { platform: "instagram", ownerId: "owner-1", channelId: "ig-disconnected" })).toBe(false);
    expect(canJoinConversation(staff, { platform: "telegram", ownerId: "owner-1", channelId: "chat-1" })).toBe(true);
    expect(conversationAccessFilter(staff)).toEqual({ $or: [
      { ownerId: "owner-1", platform: { $in: ["facebook", "zalo", "telegram", "zalo_personal", "telegram_personal"] } },
      { platform: { $nin: ["facebook", "instagram", "zalo", "telegram", "zalo_personal", "telegram_personal"] }, ownerId: "staff-new" }
    ] });
  });

  it("requires an exact Instagram grant for connected accounts even when other channels are unrestricted", () => {
    const staff: Parameters<typeof canJoinConversation>[0] = { id: "staff-new", role: "customer", workspace: {
      role: "staff", ownerUserId: "owner-1", allowedChannels: [], activeInstagramChannelIds: ["ig-active"], revokedChannels: []
    } };
    expect(canJoinConversation(staff, { platform: "instagram", ownerId: "owner-1", channelId: "ig-active" })).toBe(false);
    expect(canJoinConversation(staff, { platform: "telegram", ownerId: "owner-1", channelId: "chat-1" })).toBe(true);
    expect(conversationAccessFilter(staff)).toEqual({ $or: [
      { ownerId: "owner-1", platform: { $in: ["facebook", "zalo", "telegram", "zalo_personal", "telegram_personal"] } },
      { platform: { $nin: ["facebook", "instagram", "zalo", "telegram", "zalo_personal", "telegram_personal"] }, ownerId: "staff-new" }
    ] });
  });

  it("allows assigned staff into only the Workspace owner's assigned personal account platform", () => {
    const staff: Parameters<typeof canJoinConversation>[0] = { id: "staff-1", role: "customer", workspace: {
      ownerUserId: "owner-1", allowedPages: [], allowedChannels: [{ platform: "telegram_personal" as const, channelId: "owner-1" }]
    } };
    expect(canJoinConversation(staff, { platform: "telegram_personal", ownerId: "owner-1", channelId: "target-chat" })).toBe(true);
    expect(canJoinConversation(staff, { platform: "zalo_personal", ownerId: "owner-1", channelId: "target-chat" })).toBe(false);
    expect(canJoinConversation(staff, { platform: "telegram_personal", ownerId: "owner-2", channelId: "target-chat" })).toBe(false);
    expect(conversationAccessFilter(staff)).toEqual({ $or: [
      { ownerId: "owner-1", platform: "telegram_personal" },
      { platform: { $nin: ["facebook", "instagram", "zalo", "telegram", "zalo_personal", "telegram_personal"] }, ownerId: "staff-1" }
    ] });
  });

  it("treats an empty Workspace channel assignment as all owner channels, including personal accounts", () => {
    const owner = { id: "owner-1", role: "customer", workspace: { ownerUserId: "owner-1", allowedChannels: [] } };
    expect(canJoinConversation(owner, { platform: "zalo_personal", ownerId: "owner-1", channelId: "thread-1" })).toBe(true);
    expect(canJoinConversation(owner, { platform: "telegram_personal", ownerId: "other-owner", channelId: "thread-1" })).toBe(false);
  });

  it("treats an empty Page list as all Workspace Facebook Pages without widening another Workspace", () => {
    const owner = { id: "owner-1", role: "customer", workspace: { ownerUserId: "owner-1", allowedPages: [] } };
    expect(canJoinConversation(owner, { platform: "facebook", ownerId: "owner-1", channelId: "page-b" })).toBe(true);
    expect(canJoinConversation(owner, { platform: "facebook", ownerId: "owner-2", channelId: "page-b" })).toBe(false);
  });
});
