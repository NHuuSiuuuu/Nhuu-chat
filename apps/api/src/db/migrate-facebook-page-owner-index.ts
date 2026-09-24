import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import mongoose from "mongoose";

const SERVER_SELECTION_TIMEOUT_MS = 5_000;

interface PageIndex {
  name: string;
  key: Record<string, number>;
  unique?: boolean;
  sparse?: boolean;
  partialFilterExpression?: Record<string, unknown>;
  collation?: Record<string, unknown>;
}

interface DuplicatePage {
  pageId: string;
  count: number;
}

export interface FacebookPageIndexCollection {
  aggregate: (pipeline: Record<string, unknown>[]) => { toArray: () => Promise<DuplicatePage[]> };
  listIndexes: () => { toArray: () => Promise<PageIndex[]> };
  createIndex: (key: { pageId: 1 }, options: { name: string; unique: true }) => Promise<string>;
}

export interface FacebookPageOwnerIndexMigrationResult {
  createdIndex: boolean;
  duplicates: DuplicatePage[];
}

// Báo Page trùng trước khi tạo index; không xóa hoặc chuyển quyền connection nào.
export async function migrateFacebookPageOwnerIndex(
  collection: FacebookPageIndexCollection
): Promise<FacebookPageOwnerIndexMigrationResult> {
  let indexes: PageIndex[];
  try {
    indexes = await collection.listIndexes().toArray();
  } catch (error) {
    // Collection mới chưa tồn tại có thể trả NamespaceNotFound khi đọc index.
    if ((error as { code?: number } | null)?.code !== 26) throw error;
    indexes = [];
  }
  const pageIndexes = indexes.filter((index) => Object.keys(index.key).length === 1 && index.key.pageId === 1);
  if (pageIndexes.some((index) => index.unique !== true || index.sparse === true
    || index.partialFilterExpression !== undefined || index.collation !== undefined)) {
    throw new Error("Existing Facebook Page index has incompatible options");
  }

  const duplicates = await collection.aggregate([
    { $group: { _id: "$pageId", count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $project: { _id: 0, pageId: "$_id", count: 1 } }
  ]).toArray();
  if (duplicates.length > 0) return { createdIndex: false, duplicates };
  if (pageIndexes.length > 0) return { createdIndex: false, duplicates: [] };

  await collection.createIndex({ pageId: 1 }, { name: "pageId_1", unique: true });
  return { createdIndex: true, duplicates: [] };
}

export async function runFacebookPageOwnerIndexMigration(
  uri: string
): Promise<FacebookPageOwnerIndexMigrationResult> {
  const connection = await mongoose.createConnection(uri, {
    serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS
  }).asPromise();

  try {
    if (!connection.db) throw new Error("MongoDB connection did not provide a database handle.");
    return await migrateFacebookPageOwnerIndex(
      connection.db.collection("facebookpageconnections") as unknown as FacebookPageIndexCollection
    );
  } finally {
    await connection.close();
  }
}

async function runFromCommandLine(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is required to run the Facebook Page index migration.");
  const result = await runFacebookPageOwnerIndexMigration(uri);
  if (result.duplicates.length > 0) {
    console.error("Duplicate Facebook Page IDs require manual resolution:", result.duplicates);
    process.exitCode = 1;
    return;
  }
  console.info(`Facebook Page owner index migration complete: created=${result.createdIndex}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  void runFromCommandLine().catch((error: unknown) => {
    console.error("Facebook Page owner index migration failed:", error instanceof Error ? error.message : "unknown error");
    process.exitCode = 1;
  });
}
