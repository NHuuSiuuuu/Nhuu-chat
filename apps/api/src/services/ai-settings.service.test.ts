import { beforeEach, describe, expect, it, vi } from "vitest";

const userModelMocks = vi.hoisted(() => ({
  findById: vi.fn(),
  findByIdAndUpdate: vi.fn()
}));

vi.mock("../models/user.model.js", () => ({ UserModel: userModelMocks }));

import { getAiSettings, updateAiSettings } from "./ai-settings.service.js";

function query<T>(value: T) {
  return { lean: vi.fn().mockResolvedValue(value) };
}

describe("AI settings service", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns defaults when an existing user has no saved AI settings", async () => {
    userModelMocks.findById.mockReturnValue(query({ _id: "user-1" }));

    await expect(getAiSettings("user-1")).resolves.toEqual({
      modelTier: "smart",
      enabled: true,
      suggestionsEnabled: true,
      sentimentEnabled: true,
      suggestionMode: "on_open",
      sentimentWindow: 3
    });
  });

  it("persists only the requested AI settings fields", async () => {
    userModelMocks.findByIdAndUpdate.mockReturnValue(query({
      _id: "user-1",
      aiSettings: {
        modelTier: "economy",
        enabled: false,
        suggestionsEnabled: false,
        sentimentEnabled: false,
        suggestionMode: "manual",
        sentimentWindow: 10
      }
    }));

    await expect(updateAiSettings("user-1", {
      modelTier: "economy",
      enabled: false,
      suggestionsEnabled: false,
      sentimentEnabled: false,
      suggestionMode: "manual",
      sentimentWindow: 10
    })).resolves.toEqual({
      modelTier: "economy",
      enabled: false,
      suggestionsEnabled: false,
      sentimentEnabled: false,
      suggestionMode: "manual",
      sentimentWindow: 10
    });

    expect(userModelMocks.findByIdAndUpdate).toHaveBeenCalledWith(
      "user-1",
      { $set: {
        "aiSettings.modelTier": "economy",
        "aiSettings.enabled": false,
        "aiSettings.suggestionsEnabled": false,
        "aiSettings.sentimentEnabled": false,
        "aiSettings.suggestionMode": "manual",
        "aiSettings.sentimentWindow": 10
      } },
      { new: true }
    );
  });
});
