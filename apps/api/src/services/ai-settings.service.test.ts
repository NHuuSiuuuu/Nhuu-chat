import { beforeEach, describe, expect, it, vi } from "vitest";

const userModelMocks = vi.hoisted(() => ({
  findById: vi.fn(),
  findByIdAndUpdate: vi.fn()
}));

const settingHistoryModelMocks = vi.hoisted(() => ({
  create: vi.fn(),
  find: vi.fn(),
  deleteMany: vi.fn()
}));

const settingHistoryServiceMocks = vi.hoisted(() => ({
  recordSettingHistory: vi.fn()
}));

vi.mock("../models/user.model.js", () => ({ UserModel: userModelMocks }));
vi.mock("../models/setting-history.model.js", () => ({
  SettingHistoryModel: settingHistoryModelMocks
}));
vi.mock("./setting-history.service.js", async () => {
  const actual = await vi.importActual<typeof import("./setting-history.service.js")>("./setting-history.service.js");
  settingHistoryServiceMocks.recordSettingHistory.mockImplementation(actual.recordSettingHistory);
  return { ...actual, recordSettingHistory: settingHistoryServiceMocks.recordSettingHistory };
});

import { getAiSettings, updateAiSettings } from "./ai-settings.service.js";

function query<T>(value: T) {
  return { lean: vi.fn().mockResolvedValue(value) };
}

function retentionQuery(rows: Array<{ _id: string }> = []) {
  const historyQuery = {
    sort: vi.fn(),
    select: vi.fn(),
    lean: vi.fn().mockResolvedValue(rows)
  };
  historyQuery.sort.mockReturnValue(historyQuery);
  historyQuery.select.mockReturnValue(historyQuery);
  return historyQuery;
}

describe("AI settings service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    settingHistoryModelMocks.create.mockResolvedValue({ _id: "history-1" });
    settingHistoryModelMocks.find.mockReturnValue(retentionQuery());
    settingHistoryModelMocks.deleteMany.mockResolvedValue({ deletedCount: 0 });
  });

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
    userModelMocks.findById.mockReturnValue(query({ _id: "user-1" }));
    userModelMocks.findByIdAndUpdate.mockReturnValue(query({ _id: "user-1" }));

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
      { returnDocument: "before" }
    );
  });

  it("records only fields changed between the old and saved normalized AI settings", async () => {
    userModelMocks.findByIdAndUpdate.mockReturnValue(query({
      _id: "user-1",
      aiSettings: {
        modelTier: "unsupported",
        enabled: true,
        suggestionsEnabled: "unsupported",
        sentimentEnabled: true,
        suggestionMode: "manual",
        sentimentWindow: 10
      }
    }));

    await updateAiSettings("user-1", { modelTier: "economy", enabled: false });

    await vi.waitFor(() => expect(settingHistoryModelMocks.create).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      actionType: "UPDATE_AI_SETTINGS",
      actionTitle: "Cập nhật cài đặt AI",
      changes: [
        { fieldName: "modelTier", oldValue: "smart", newValue: "economy" },
        { fieldName: "enabled", oldValue: true, newValue: false }
      ]
    })));
  });

  it("does not create history when an AI patch keeps normalized settings unchanged", async () => {
    userModelMocks.findById.mockReturnValue(query({ _id: "user-1" }));
    userModelMocks.findByIdAndUpdate.mockReturnValue(query({
      _id: "user-1",
      aiSettings: {
        modelTier: "smart",
        enabled: true,
        suggestionsEnabled: true,
        sentimentEnabled: true,
        suggestionMode: "on_open",
        sentimentWindow: 3
      }
    }));

    await updateAiSettings("user-1", { enabled: true });

    expect(settingHistoryServiceMocks.recordSettingHistory).toHaveBeenCalledOnce();
    expect(settingHistoryModelMocks.create).not.toHaveBeenCalled();
  });

  it("keeps a successful AI update successful when history persistence fails", async () => {
    const historyError = new Error("history unavailable");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    settingHistoryServiceMocks.recordSettingHistory.mockRejectedValueOnce(historyError);
    userModelMocks.findById.mockReturnValue(query({ _id: "user-1", aiSettings: { enabled: true } }));
    userModelMocks.findByIdAndUpdate.mockReturnValue(query({
      _id: "user-1",
      aiSettings: { enabled: true }
    }));

    await expect(updateAiSettings("user-1", { enabled: false })).resolves.toMatchObject({ enabled: false });

    expect(settingHistoryServiceMocks.recordSettingHistory).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(consoleError).toHaveBeenCalledWith(
      "Failed to record setting history",
      expect.objectContaining({ userId: "user-1", actionType: "UPDATE_AI_SETTINGS", error: historyError })
    ));
    consoleError.mockRestore();
  });
});
