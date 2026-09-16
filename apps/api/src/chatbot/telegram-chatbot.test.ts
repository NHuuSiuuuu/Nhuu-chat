import { describe, expect, it, vi } from "vitest";

const dependencies = vi.hoisted(() => ({
  getActiveZaloPersonalClient: vi.fn()
}));

vi.mock("../services/zalo-personal.service.js", () => ({
  getActiveZaloPersonalClient: dependencies.getActiveZaloPersonalClient
}));

import { resolveTelegramBotAdapter } from "./telegram-chatbot.js";

describe("chatbot channel adapters", () => {
  it("resolves Zalo personal and sends through the active session", async () => {
    const sendMessage = vi.fn().mockResolvedValue({ id: "zalo-bot-message-1" });
    dependencies.getActiveZaloPersonalClient.mockResolvedValue({
      sendMessage,
      getAccountInfo: vi.fn().mockResolvedValue({ id: "zalo-account-1" })
    });

    const adapter = await resolveTelegramBotAdapter({
      ownerId: "owner-1",
      platform: "zalo_personal",
      channelId: "group-1",
      conversationType: "group"
    });

    await expect(adapter?.sendText({ channelId: "group-1", content: "Xin chào" })).resolves.toEqual({
      externalMessageId: "zalo-bot-message-1"
    });
    expect(sendMessage).toHaveBeenCalledWith("group-1", "Xin chào", "group");
  });
});
