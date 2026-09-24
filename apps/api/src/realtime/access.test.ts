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
      { platform: "facebook", ownerId: "owner-1", channelId: { $in: ["page-a"] } },
      { platform: { $ne: "facebook" }, ownerId: "staff-1" }
    ] });
  });

  it("treats an empty Page list as all Workspace Facebook Pages without widening another Workspace", () => {
    const owner = { id: "owner-1", role: "customer", workspace: { ownerUserId: "owner-1", allowedPages: [] } };
    expect(canJoinConversation(owner, { platform: "facebook", ownerId: "owner-1", channelId: "page-b" })).toBe(true);
    expect(canJoinConversation(owner, { platform: "facebook", ownerId: "owner-2", channelId: "page-b" })).toBe(false);
  });
});
