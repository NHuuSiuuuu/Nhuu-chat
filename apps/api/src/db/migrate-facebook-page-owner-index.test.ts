import { describe, expect, it, vi } from "vitest";

import { migrateFacebookPageOwnerIndex } from "./migrate-facebook-page-owner-index.js";

function collection(
  duplicates: Array<{ pageId: string; count: number }>,
  indexes: Array<{ name: string; key: Record<string, number>; unique?: boolean }> = []
) {
  return {
    aggregate: vi.fn(() => ({ toArray: async () => duplicates })),
    listIndexes: vi.fn(() => ({ toArray: async () => indexes })),
    createIndex: vi.fn(async () => "pageId_1")
  };
}

describe("migrateFacebookPageOwnerIndex", () => {
  it("reports duplicate Page IDs and makes no index changes", async () => {
    const pages = collection([{ pageId: "page-123", count: 2 }]);

    await expect(migrateFacebookPageOwnerIndex(pages)).resolves.toEqual({
      createdIndex: false,
      duplicates: [{ pageId: "page-123", count: 2 }]
    });
    expect(pages.aggregate).toHaveBeenCalledWith([
      { $group: { _id: "$pageId", count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $project: { _id: 0, pageId: "$_id", count: 1 } }
    ]);
    expect(pages.createIndex).not.toHaveBeenCalled();
  });

  it("creates the unique Page index after a clean preflight", async () => {
    const pages = collection([]);

    await expect(migrateFacebookPageOwnerIndex(pages)).resolves.toEqual({ createdIndex: true, duplicates: [] });
    expect(pages.createIndex).toHaveBeenCalledWith({ pageId: 1 }, { name: "pageId_1", unique: true });
  });

  it("creates the unique Page index when listIndexes reports a missing collection", async () => {
    const pages = collection([]);
    pages.listIndexes.mockReturnValue({
      toArray: async () => { throw Object.assign(new Error("ns does not exist"), {
        code: 26, codeName: "NamespaceNotFound"
      }); }
    });

    await expect(migrateFacebookPageOwnerIndex(pages)).resolves.toEqual({ createdIndex: true, duplicates: [] });
    expect(pages.createIndex).toHaveBeenCalledWith({ pageId: 1 }, { name: "pageId_1", unique: true });
  });

  it("preserves unrelated listIndexes failures", async () => {
    const pages = collection([]);
    pages.listIndexes.mockReturnValue({ toArray: async () => { throw new Error("connection lost"); } });

    await expect(migrateFacebookPageOwnerIndex(pages)).rejects.toThrow("connection lost");
    expect(pages.createIndex).not.toHaveBeenCalled();
  });

  it("is idempotent when the compatible unique index already exists", async () => {
    const pages = collection([], [{ name: "pageId_1", key: { pageId: 1 }, unique: true }]);

    await expect(migrateFacebookPageOwnerIndex(pages)).resolves.toEqual({ createdIndex: false, duplicates: [] });
    expect(pages.createIndex).not.toHaveBeenCalled();
  });

  it("fails safely on an incompatible Page index", async () => {
    const pages = collection([], [{ name: "pageId_1", key: { pageId: 1 }, unique: false }]);

    await expect(migrateFacebookPageOwnerIndex(pages)).rejects.toThrow("incompatible");
    expect(pages.createIndex).not.toHaveBeenCalled();
  });
});
