import { beforeEach, describe, expect, it, vi } from "vitest";

const dependencies = vi.hoisted(() => ({
  conversation: {
    findByIdAndUpdate: vi.fn()
  },
  user: {
    exists: vi.fn()
  },
  pauseBot: vi.fn()
}));

vi.mock("../models/conversation.model.js", () => ({ ConversationModel: dependencies.conversation }));
vi.mock("../models/user.model.js", () => ({ UserModel: dependencies.user }));
vi.mock("../orchestration/bot-pause.service.js", () => ({ pauseBot: dependencies.pauseBot }));

import { updateAssignment, updateBotEnabled } from "./conversation.service.js";

describe("conversation assignment handoff", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    dependencies.user.exists.mockResolvedValue(true);
    dependencies.conversation.findByIdAndUpdate.mockReturnValue({
      populate: vi.fn().mockReturnValue({
        populate: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue({
            _id: "conversation-1",
            customerId: "customer-1",
            platform: "telegram",
            channelId: "42",
            assignedAgentId: "agent-1",
            unreadCount: 0,
            status: "open",
            lastMessageAt: new Date("2026-09-16T00:00:00.000Z"),
            lastMessageSnippet: ""
          })
        })
      })
    });
  });

  it("pauses the bot when an agent takes over the conversation", async () => {
    await updateAssignment("conversation-1", "507f1f77bcf86cd799439011");

    expect(dependencies.pauseBot).toHaveBeenCalledWith("conversation-1", expect.any(Date));
  });

  it("does not pause the bot when an assignment is cleared", async () => {
    await updateAssignment("conversation-1", null);

    expect(dependencies.pauseBot).not.toHaveBeenCalled();
  });

  it("persists the bot switch state when an agent turns automatic replies off", async () => {
    await updateBotEnabled("conversation-1", false);

    expect(dependencies.conversation.findByIdAndUpdate).toHaveBeenCalledWith(
      "conversation-1",
      { $set: { botEnabled: false } },
      { new: true }
    );
  });
});
