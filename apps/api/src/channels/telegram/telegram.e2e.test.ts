import { describe, expect, it, vi } from "vitest";

import { orchestrateTelegramReply } from "../../services/telegram.service.js";

describe("Telegram webhook bot orchestration", () => {
  const inbound = {
    conversationId: "conversation-1", channelId: "123", content: "Giờ mở cửa?"
  };

  it("does not call RAG or enqueue a bot reply while the bot is paused", async () => {
    const answer = vi.fn();
    const enqueue = vi.fn();

    await orchestrateTelegramReply({
      ...inbound,
      botPausedUntil: new Date("2026-09-09T10:30:00.000Z")
    }, {
      now: () => new Date("2026-09-09T10:00:00.000Z"),
      answer,
      createBotMessage: vi.fn(),
      enqueue
    });

    expect(answer).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("creates and enqueues a grounded bot reply when active", async () => {
    const enqueue = vi.fn().mockResolvedValue("job-1");
    const createBotMessage = vi.fn().mockResolvedValue({ id: "message-1" });

    await orchestrateTelegramReply({ ...inbound, botPausedUntil: null }, {
      now: () => new Date("2026-09-09T10:00:00.000Z"),
      answer: vi.fn().mockResolvedValue({ answer: "Mở cửa lúc 8 giờ", handoff: false, sources: [] }),
      createBotMessage,
      enqueue
    });

    expect(createBotMessage).toHaveBeenCalledWith(inbound, "Mở cửa lúc 8 giờ");
    expect(enqueue).toHaveBeenCalledWith({
      messageId: "message-1", conversationId: "conversation-1", platform: "telegram",
      channelId: "123", content: "Mở cửa lúc 8 giờ"
    });
  });
});
