import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import mongoose from "mongoose";

const instagramKey = { platform: 1, channelId: 1, ownerId: 1, customerId: 1 };
const otherKey = { platform: 1, channelId: 1, ownerId: 1 };
const instagramName = "platform_1_channelId_1_ownerId_1_customerId_1_instagram";
const otherName = "platform_1_channelId_1_ownerId_1_other";
const oldName = "platform_1_channelId_1_ownerId_1_non_facebook";
const instagramFilter = { platform: "instagram" };
const otherFilter = { platform: { $in: ["zalo", "telegram", "telegram_personal", "zalo_personal"] } };
const oldFilter = { platform: { $in: ["instagram", "zalo", "telegram", "telegram_personal", "zalo_personal"] } };

interface IndexDefinition {
  name: string;
  key: Record<string, number>;
  unique?: boolean;
  partialFilterExpression?: Record<string, unknown>;
  sparse?: boolean;
  collation?: Record<string, unknown>;
}

export interface DuplicateInstagramConversation {
  platform: "instagram";
  channelId: string;
  ownerId: mongoose.Types.ObjectId;
  customerId: mongoose.Types.ObjectId;
  ids: mongoose.Types.ObjectId[];
}

export interface InstagramConversationIndexCollection {
  listIndexes: () => { toArray: () => Promise<IndexDefinition[]> };
  aggregate: (pipeline: Record<string, unknown>[]) => { toArray: () => Promise<DuplicateInstagramConversation[]> };
  createIndex: (key: Record<string, number>, options: { name: string; unique: true; partialFilterExpression: Record<string, unknown> }) => Promise<string>;
  dropIndex: (name: string) => Promise<unknown>;
}

export interface InstagramConversationIndexMigrationResult {
  createdInstagramIndex: boolean;
  createdOtherIndex: boolean;
  droppedOldIndex: boolean;
  duplicates: DuplicateInstagramConversation[];
}

function matches(index: IndexDefinition, key: Record<string, number>, filter: Record<string, unknown>): boolean {
  return JSON.stringify(index.key) === JSON.stringify(key)
    && JSON.stringify(index.partialFilterExpression) === JSON.stringify(filter)
    && index.unique === true && index.sparse !== true && index.collation === undefined;
}

// Kiểm tra dữ liệu và định nghĩa index trước khi thay ràng buộc cũ; không sửa bản ghi trùng.
export async function migrateInstagramConversationCustomerIndex(
  collection: InstagramConversationIndexCollection
): Promise<InstagramConversationIndexMigrationResult> {
  let indexes: IndexDefinition[];
  try {
    indexes = await collection.listIndexes().toArray();
  } catch (error) {
    if ((error as { code?: number } | null)?.code !== 26) throw error;
    indexes = [];
  }

  const old = indexes.find((index) => index.name === oldName);
  const instagram = indexes.find((index) => index.name === instagramName);
  const other = indexes.find((index) => index.name === otherName);
  const unexpectedOwnerIndex = indexes.find((index) =>
    JSON.stringify(index.key) === JSON.stringify(otherKey)
    && index.unique === true && index.name !== oldName && index.name !== otherName
  );
  if ((old && !matches(old, otherKey, oldFilter))
    || (instagram && !matches(instagram, instagramKey, instagramFilter))
    || (other && !matches(other, otherKey, otherFilter)) || unexpectedOwnerIndex) {
    throw new Error("Existing conversation index has incompatible options");
  }

  const duplicates = await collection.aggregate([
    { $match: { platform: "instagram" } },
    { $sort: { _id: 1 } },
    { $group: {
      _id: { platform: "$platform", channelId: "$channelId", ownerId: "$ownerId", customerId: "$customerId" },
      ids: { $push: "$_id" }, count: { $sum: 1 }
    } },
    { $match: { count: { $gt: 1 } } },
    { $project: { _id: 0, platform: "$_id.platform", channelId: "$_id.channelId", ownerId: "$_id.ownerId", customerId: "$_id.customerId", ids: 1 } }
  ]).toArray();
  if (duplicates.length > 0) return { createdInstagramIndex: false, createdOtherIndex: false, droppedOldIndex: false, duplicates };

  if (!instagram) await collection.createIndex(instagramKey, { name: instagramName, unique: true, partialFilterExpression: instagramFilter });
  if (!other) await collection.createIndex(otherKey, { name: otherName, unique: true, partialFilterExpression: otherFilter });
  if (old) await collection.dropIndex(oldName);
  return { createdInstagramIndex: !instagram, createdOtherIndex: !other, droppedOldIndex: !!old, duplicates: [] };
}

export async function runInstagramConversationCustomerIndexMigration(uri: string): Promise<InstagramConversationIndexMigrationResult> {
  const connection = await mongoose.createConnection(uri, { serverSelectionTimeoutMS: 5_000, autoIndex: false }).asPromise();
  try {
    if (!connection.db) throw new Error("MongoDB connection did not provide a database handle");
    return await migrateInstagramConversationCustomerIndex(connection.db.collection("conversations") as unknown as InstagramConversationIndexCollection);
  } finally {
    await connection.close();
  }
}

async function runFromCommandLine(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is required");
  const result = await runInstagramConversationCustomerIndexMigration(uri);
  if (result.duplicates.length > 0) {
    console.error("Duplicate Instagram conversations require manual resolution:", result.duplicates);
    process.exitCode = 1;
    return;
  }
  console.info(`Instagram conversation index migration complete: createdInstagram=${result.createdInstagramIndex}, createdOther=${result.createdOtherIndex}, droppedOld=${result.droppedOldIndex}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  void runFromCommandLine().catch((error: unknown) => {
    console.error("Instagram conversation index migration failed:", error instanceof Error ? error.message : "unknown error");
    process.exitCode = 1;
  });
}
