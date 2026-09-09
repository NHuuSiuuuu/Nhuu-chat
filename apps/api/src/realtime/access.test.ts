import { describe, expect, it } from "vitest";

import { canJoinConversation } from "./access.js";

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
});
