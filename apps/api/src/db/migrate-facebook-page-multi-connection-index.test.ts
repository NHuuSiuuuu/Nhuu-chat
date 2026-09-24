import { describe, expect, it, vi } from "vitest";

import { migrateFacebookPageMultiConnectionIndex, type FacebookConnectionIndexCollection } from "./migrate-facebook-page-multi-connection-index.js";

function collection() {
  const indexes: Array<{ name: string; key: Record<string, number>; unique: boolean }> = [
    { name: "_id_", key: { _id: 1 }, unique: true },
    { name: "userId_1", key: { userId: 1 }, unique: true },
    { name: "pageId_1", key: { pageId: 1 }, unique: true },
    { name: "userId_1_pageId_1", key: { userId: 1, pageId: 1 }, unique: true }
  ];
  const adapter: FacebookConnectionIndexCollection = {
    listIndexes: () => ({ toArray: async () => indexes }),
    dropIndex: vi.fn(async () => undefined)
  };
  return adapter;
}

describe("Facebook Page multi-connection migration", () => {
  it("reports the old per-user unique index without writing in dry-run mode", async () => {
    const db = collection();
    await expect(migrateFacebookPageMultiConnectionIndex(db)).resolves.toEqual({
      legacyUniqueUserIndexes: ["userId_1"], dropped: []
    });
    expect(db.dropIndex).not.toHaveBeenCalled();
  });

  it("drops only the unique userId index and preserves Page ownership indexes", async () => {
    const db = collection();
    await expect(migrateFacebookPageMultiConnectionIndex(db, true)).resolves.toEqual({
      legacyUniqueUserIndexes: ["userId_1"], dropped: ["userId_1"]
    });
    expect(db.dropIndex).toHaveBeenCalledOnce();
    expect(db.dropIndex).toHaveBeenCalledWith("userId_1");
  });
});
