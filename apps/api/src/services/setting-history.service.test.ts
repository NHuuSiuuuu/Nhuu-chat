import { beforeEach, describe, expect, it, vi } from "vitest";

const settingHistoryModel = vi.hoisted(() => ({
  create: vi.fn(),
  find: vi.fn(),
  countDocuments: vi.fn(),
  deleteMany: vi.fn()
}));

vi.mock("../models/setting-history.model.js", () => ({
  SettingHistoryModel: settingHistoryModel
}));

import {
  diffSettings,
  listSettingHistories,
  recordSettingHistory
} from "./setting-history.service.js";

function retentionQuery(rows: Array<{ _id: string }>) {
  const query = {
    sort: vi.fn(),
    select: vi.fn(),
    lean: vi.fn().mockResolvedValue(rows)
  };
  query.sort.mockReturnValue(query);
  query.select.mockReturnValue(query);
  return query;
}

function listQuery(items: unknown[]) {
  const query = {
    sort: vi.fn(),
    skip: vi.fn(),
    limit: vi.fn(),
    lean: vi.fn().mockResolvedValue(items)
  };
  query.sort.mockReturnValue(query);
  query.skip.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  return query;
}

describe("setting history diff", () => {
  it("reports a changed primitive", () => {
    expect(diffSettings({ enabled: true }, { enabled: false })).toEqual([
      { fieldName: "enabled", oldValue: true, newValue: false }
    ]);
  });

  it("reports a nested object value with a breadcrumb path", () => {
    expect(diffSettings({ ai: { mode: "smart" } }, { ai: { mode: "economy" } })).toEqual([
      { fieldName: "ai › mode", oldValue: "smart", newValue: "economy" }
    ]);
  });

  it("reports an added array item with its index", () => {
    expect(diffSettings({ values: ["a"] }, { values: ["a", "b"] })).toEqual([
      { fieldName: "values › 1", oldValue: undefined, newValue: "b" }
    ]);
  });

  it("preserves null and missing values without serializing them", () => {
    expect(diffSettings({ value: null, removed: "old" }, { value: "new" })).toEqual([
      { fieldName: "value", oldValue: null, newValue: "new" },
      { fieldName: "removed", oldValue: "old", newValue: undefined }
    ]);
  });

  it("returns no changes for equivalent settings", () => {
    expect(diffSettings({ enabled: true }, { enabled: true })).toEqual([]);
  });
});

describe("setting history service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    settingHistoryModel.deleteMany.mockResolvedValue({ deletedCount: 0 });
  });

  it("does not create a history row when settings are unchanged", async () => {
    const result = await recordSettingHistory({
      userId: "user-1",
      actionType: "UPDATE_AI_SETTINGS",
      actionTitle: "Cập nhật cài đặt AI",
      oldValue: { enabled: true },
      newValue: { enabled: true }
    });

    expect(result).toBeNull();
    expect(settingHistoryModel.create).not.toHaveBeenCalled();
    expect(settingHistoryModel.find).not.toHaveBeenCalled();
  });

  it("records nested changes and removes every row older than the newest 500", async () => {
    const saved = { _id: "history-502", versionHash: "a1b2c3d4" };
    const rows = Array.from({ length: 502 }, (_, index) => ({ _id: `history-${index + 1}` }));
    const query = retentionQuery(rows);
    settingHistoryModel.create.mockResolvedValue(saved);
    settingHistoryModel.find.mockReturnValue(query);

    const result = await recordSettingHistory({
      userId: "user-1",
      actionType: "UPDATE_AI_SETTINGS",
      actionTitle: "Cập nhật cài đặt AI",
      oldValue: { ai: { mode: "smart" } },
      newValue: { ai: { mode: "economy" } }
    });

    expect(result).toBe(saved);
    expect(settingHistoryModel.create).toHaveBeenCalledWith({
      userId: "user-1",
      actionType: "UPDATE_AI_SETTINGS",
      actionTitle: "Cập nhật cài đặt AI",
      changes: [{ fieldName: "ai › mode", oldValue: "smart", newValue: "economy" }],
      versionHash: expect.stringMatching(/^[a-f0-9]{8}$/)
    });
    expect(settingHistoryModel.find).toHaveBeenCalledWith({ userId: "user-1" });
    expect(query.sort).toHaveBeenCalledWith({ createdAt: 1, _id: 1 });
    expect(query.select).toHaveBeenCalledWith("_id");
    expect(settingHistoryModel.deleteMany).toHaveBeenCalledWith({
      _id: { $in: ["history-1", "history-2"] }
    });
  });

  it("lists one user's filtered history with bounded pagination", async () => {
    const items = [{ _id: "history-51" }];
    const query = listQuery(items);
    settingHistoryModel.find.mockReturnValue(query);
    settingHistoryModel.countDocuments.mockResolvedValue(101);

    const result = await listSettingHistories({
      userId: "user-1",
      page: 2,
      pageSize: 100,
      actionType: "CONNECT_FACEBOOK_PAGE"
    });

    expect(result).toEqual({
      items,
      pagination: {
        page: 2,
        pageSize: 50,
        total: 101,
        totalPages: 3,
        hasNextPage: true
      }
    });
    expect(settingHistoryModel.find).toHaveBeenCalledWith({
      userId: "user-1",
      actionType: "CONNECT_FACEBOOK_PAGE"
    });
    expect(settingHistoryModel.countDocuments).toHaveBeenCalledWith({
      userId: "user-1",
      actionType: "CONNECT_FACEBOOK_PAGE"
    });
    expect(query.sort).toHaveBeenCalledWith({ createdAt: -1, _id: -1 });
    expect(query.skip).toHaveBeenCalledWith(50);
    expect(query.limit).toHaveBeenCalledWith(50);
  });
});
