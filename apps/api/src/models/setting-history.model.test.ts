import mongoose from "mongoose";
import { describe, expect, it } from "vitest";

import { SettingHistoryModel } from "./setting-history.model.js";

describe("Setting history model", () => {
  it("requires the audit fields and defines timestamps", () => {
    for (const fieldName of ["userId", "actionType", "actionTitle", "changes", "versionHash"]) {
      expect(SettingHistoryModel.schema.path(fieldName).options.required).toBe(true);
    }

    expect(SettingHistoryModel.schema.path("createdAt")).toBeDefined();
    expect(SettingHistoryModel.schema.path("updatedAt")).toBeDefined();
    expect(SettingHistoryModel.schema.options.timestamps).toBe(true);
  });

  it("references users and stores changes without subdocument ids", () => {
    const userPath = SettingHistoryModel.schema.path("userId");
    const changesPath = SettingHistoryModel.schema.path("changes") as mongoose.Schema.Types.DocumentArray;

    expect(userPath.options.ref).toBe("User");
    expect(changesPath.schema.options._id).toBe(false);
  });

  it("accepts only the initial setting history action types", async () => {
    const history = new SettingHistoryModel({
      userId: new mongoose.Types.ObjectId(),
      actionType: "UNSUPPORTED_ACTION",
      actionTitle: "Unsupported action",
      changes: [{ fieldName: "enabled", oldValue: true, newValue: false }],
      versionHash: "a1b2c3d4"
    });

    await expect(history.validate()).rejects.toMatchObject({
      errors: { actionType: expect.anything() }
    });
  });

  it("defines chronological and action-filtered compound indexes", () => {
    const indexFields = SettingHistoryModel.schema.indexes().map(([fields]) => fields);

    expect(indexFields).toEqual(expect.arrayContaining([
      { userId: 1, createdAt: -1, _id: -1 },
      { userId: 1, actionType: 1, createdAt: -1, _id: -1 }
    ]));
  });
});
