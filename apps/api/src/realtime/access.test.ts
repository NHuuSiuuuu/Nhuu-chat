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
    expect(conversationAccessFilter({ id: "admin-1", role: "admin" })).toEqual({});
  });
});
