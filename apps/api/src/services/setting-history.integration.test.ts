import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { UserModel } from "../models/user.model.js";
import { FacebookPageConnectionModel } from "../models/facebook-page-connection.model.js";
import { SettingHistoryModel } from "../models/setting-history.model.js";
import { startTestDatabase, stopTestDatabase } from "../test/mongo-repl-set.js";
import { updateAiSettings } from "./ai-settings.service.js";
import { FacebookPageService } from "./facebook-page.service.js";
import { recordSettingHistory } from "./setting-history.service.js";

beforeAll(async () => {
  await startTestDatabase();
  await Promise.all([UserModel.init(), FacebookPageConnectionModel.init(), SettingHistoryModel.init()]);
}, 30_000);

afterAll(stopTestDatabase);

beforeEach(async () => {
  await Promise.all([UserModel.deleteMany({}), FacebookPageConnectionModel.deleteMany({}), SettingHistoryModel.deleteMany({})]);
});

function service() {
  return new FacebookPageService({
    fetchGraph: async (url) => {
      const id = new URL(url).pathname.split("/").at(-1)!;
      return new Response(JSON.stringify({ id, name: `  ${id}  ` }), { status: 200 });
    },
    encryptSecret: (value) => `ciphertext:${value}`,
    graphApiVersion: "v26.0"
  });
}

describe("setting history with MongoDB", () => {
  it("attributes concurrent AI writes only to the fields each request changed", async () => {
    const user = await UserModel.create({ email: "audit@example.test", name: "Audit", passwordHash: "test-hash", role: "agent" });
    const userId = String(user._id);
    await Promise.all([
      updateAiSettings(userId, { enabled: false }),
      updateAiSettings(userId, { sentimentEnabled: false })
    ]);
    await vi.waitFor(async () => expect(await SettingHistoryModel.countDocuments({ userId })).toBe(2));

    const rows = await SettingHistoryModel.find({ userId }).lean();
    expect(rows.map((row) => row.changes)).toEqual(expect.arrayContaining([
      [{ fieldName: "enabled", oldValue: true, newValue: false }],
      [{ fieldName: "sentimentEnabled", oldValue: true, newValue: false }]
    ]));
    expect((await UserModel.findById(userId).lean())?.aiSettings).toMatchObject({ enabled: false, sentimentEnabled: false });
  });

  it("serializes concurrent initial Page connects with exact persisted metadata and response fields", async () => {
    const userId = String(new mongoose.Types.ObjectId());
    const pages = service();
    const results = await Promise.all([
      pages.connect(userId, { pageId: "page-a", pageAccessToken: "test-secret-a" }),
      pages.connect(userId, { pageId: "page-b", pageAccessToken: "test-secret-b" })
    ]);
    await vi.waitFor(async () => expect(await SettingHistoryModel.countDocuments({ userId })).toBe(2));

    const rows = await SettingHistoryModel.find({ userId }).lean();
    const changes = rows.map((row) => row.changes.find((change: { fieldName: string }) => change.fieldName === "pageId"));
    const first = changes.find((change) => change.oldValue === "(không có)");
    const second = changes.find((change) => change.oldValue !== "(không có)");
    expect(first).toBeDefined();
    expect(second.oldValue).toBe(first.newValue);
    expect(second.newValue).not.toBe(first.newValue);
    const saved = await FacebookPageConnectionModel.findOne({ userId }).lean();
    expect(saved?.pageId).toBe(second.newValue);
    expect(results.find((result) => result.pageId === second.newValue)).toEqual({
      id: String(saved?._id), pageId: saved?.pageId, pageName: saved?.pageName,
      avatarUrl: null, status: "connected", lastValidatedAt: saved?.lastValidatedAt.toISOString(),
      lastErrorCode: null, createdAt: saved?.createdAt.toISOString(), updatedAt: saved?.updatedAt.toISOString()
    });
    expect(results.map((result) => result.pageName).sort()).toEqual(["page-a", "page-b"]);
    expect(JSON.stringify(rows)).not.toMatch(/ciphertext|test-secret/);
  });

  it("audits only the actual atomic delete under duplicate disconnects", async () => {
    const userId = String(new mongoose.Types.ObjectId());
    await FacebookPageConnectionModel.create({ userId, pageId: "page-a", pageName: "Page A", encryptedPageAccessToken: "ciphertext" });
    const pages = service();
    await Promise.all([pages.remove(userId), pages.remove(userId)]);
    await vi.waitFor(async () => expect(await SettingHistoryModel.countDocuments({ userId })).toBe(1));

    expect(await FacebookPageConnectionModel.countDocuments({ userId })).toBe(0);
    expect((await SettingHistoryModel.findOne({ userId }).lean())?.changes).toEqual([
      { fieldName: "pageId", oldValue: "page-a", newValue: "(không có)" },
      { fieldName: "pageName", oldValue: "Page A", newValue: "(không có)" },
      { fieldName: "status", oldValue: "connected", newValue: "(không có)" }
    ]);
  });

  it("retains the newest 500 rows without deleting another user's history", async () => {
    const userId = String(new mongoose.Types.ObjectId());
    const otherUserId = String(new mongoose.Types.ObjectId());
    const oldRows = await SettingHistoryModel.insertMany(Array.from({ length: 500 }, (_, index) => ({
      userId, actionType: "UPDATE_AI_SETTINGS", actionTitle: "Cập nhật cài đặt AI",
      versionHash: String(index), changes: [{ fieldName: "enabled", oldValue: true, newValue: false }],
      createdAt: new Date(Date.UTC(2020, 0, 1, 0, 0, index))
    })));
    const other = await recordSettingHistory({ userId: otherUserId, actionType: "UPDATE_AI_SETTINGS", actionTitle: "Cập nhật cài đặt AI", oldValue: { enabled: true }, newValue: { enabled: false } });
    const latest = await recordSettingHistory({ userId, actionType: "UPDATE_AI_SETTINGS", actionTitle: "Cập nhật cài đặt AI", oldValue: { enabled: false }, newValue: { enabled: true } });

    expect(await SettingHistoryModel.countDocuments({ userId })).toBe(500);
    expect(await SettingHistoryModel.findById(oldRows[0]!._id)).toBeNull();
    expect(await SettingHistoryModel.findOne({ userId, versionHash: latest!.versionHash })).not.toBeNull();
    expect(await SettingHistoryModel.findOne({ userId: otherUserId, versionHash: other!.versionHash })).not.toBeNull();
  });
});
