import { beforeEach, describe, expect, it, vi } from "vitest";

const sessionModel = vi.hoisted(() => ({
  findOne: vi.fn()
}));

vi.mock("../channels/telegram-personal/telegram-personal.model.js", () => ({
  TelegramPersonalSessionModel: sessionModel
}));

import { getPersonalSessionStatus } from "./telegram-personal.service.js";

describe("getPersonalSessionStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the persisted Telegram user ID for a connected session", async () => {
    sessionModel.findOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        status: "active",
        telegramUserId: "telegram-user-123",
        displayName: "Chủ cửa hàng",
        username: "nhuu",
        avatarUrl: null
      })
    });

    await expect(getPersonalSessionStatus("user-1")).resolves.toEqual({
      connected: true,
      telegramUserId: "telegram-user-123",
      displayName: "Chủ cửa hàng",
      username: "nhuu",
      avatarUrl: null
    });
  });
});
