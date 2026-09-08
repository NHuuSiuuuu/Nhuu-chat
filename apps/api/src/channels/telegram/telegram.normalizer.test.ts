import { describe, expect, it } from "vitest";

import { normalizeTelegramUpdate } from "./telegram.normalizer.js";
import { telegramUpdateSchema } from "./telegram.schemas.js";

describe("normalizeTelegramUpdate", () => {
  it("normalizes an inbound Telegram text message", () => {
    const update = telegramUpdateSchema.parse({
      update_id: 7001,
      message: {
        message_id: 99,
        date: 1_725_801_200,
        chat: { id: 456, type: "private" },
        from: {
          id: 123,
          is_bot: false,
          first_name: "Nhuu",
          last_name: "Tester",
          username: "nhuu_tester"
        },
        text: "Xin chào"
      }
    });

    expect(normalizeTelegramUpdate(update)).toEqual({
      platform: "telegram",
      externalMessageId: "99",
      channelId: "456",
      senderId: "123",
      senderName: "Nhuu Tester",
      senderUsername: "nhuu_tester",
      type: "text",
      content: "Xin chào",
      sentAt: new Date("2024-09-08T13:13:20.000Z"),
      metadata: { updateId: 7001, chatType: "private" }
    });
  });

  it("returns null for a valid unsupported update", () => {
    const update = telegramUpdateSchema.parse({
      update_id: 7002,
      callback_query: { id: "callback-1" }
    });

    expect(normalizeTelegramUpdate(update)).toBeNull();
  });
});
