import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import mongoose from "mongoose";

export const FACEBOOK_CONVERSATION_UNIQUE_INDEX = { platform: 1, channelId: 1, ownerId: 1, customerId: 1 };
export const NON_FACEBOOK_CONVERSATION_UNIQUE_INDEX = { platform: 1, channelId: 1, ownerId: 1 };
const FACEBOOK_INDEX_NAME = "platform_1_channelId_1_ownerId_1_customerId_1_facebook";
const NON_FACEBOOK_INDEX_NAME = "platform_1_channelId_1_ownerId_1_non_facebook";
const LEGACY_INDEX_NAME = "platform_1_channelId_1_ownerId_1";
const NON_FACEBOOK_PLATFORMS = ["instagram", "zalo", "telegram", "telegram_personal", "zalo_personal"];
const FACEBOOK_FILTER = { platform: "facebook" };
const NON_FACEBOOK_FILTER = { platform: { $in: NON_FACEBOOK_PLATFORMS } };

type Index = {
  name: string;
  key: Record<string, number>;
  unique?: boolean;
  partialFilterExpression?: Record<string, unknown>;
  sparse?: boolean;
  collation?: Record<string, unknown>;
};

export type ConversationIndexCollection = {
  listIndexes: () => { toArray: () => Promise<Index[]> };
  createIndex: (key: Record<string, number>, options: { name: string; unique: boolean; partialFilterExpression: Record<string, unknown> }) => Promise<string>;
  dropIndex: (name: string) => Promise<unknown>;
};

function sameKey(actual: Record<string, number>, expected: Record<string, number>): boolean {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function sameFilter(actual: Record<string, unknown> | undefined, expected: Record<string, unknown>): boolean {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function compatible(index: Index, filter: Record<string, unknown>): boolean {
  return index.unique === true && index.sparse !== true && index.collation === undefined && sameFilter(index.partialFilterExpression, filter);
}

// Tạo hai ràng buộc mới trước khi bỏ unique index cũ để không có khoảng trống cho dữ liệu trùng.
export async function migrateFacebookConversationCustomerIndex(collection: ConversationIndexCollection): Promise<{
  createdFacebookIndex: boolean;
  createdNonFacebookIndex: boolean;
  droppedLegacyIndex: boolean;
}> {
  const indexes = await collection.listIndexes().toArray();
  const facebookIndexes = indexes.filter((item) => sameKey(item.key, FACEBOOK_CONVERSATION_UNIQUE_INDEX));
  const nonFacebookIndexes = indexes.filter((item) => sameKey(item.key, NON_FACEBOOK_CONVERSATION_UNIQUE_INDEX) && item.name !== LEGACY_INDEX_NAME);
  const legacyIndexes = indexes.filter((item) => sameKey(item.key, NON_FACEBOOK_CONVERSATION_UNIQUE_INDEX) && item.name === LEGACY_INDEX_NAME);
  if (facebookIndexes.some((item) => !compatible(item, FACEBOOK_FILTER))
    || nonFacebookIndexes.some((item) => !compatible(item, NON_FACEBOOK_FILTER))
    || legacyIndexes.some((item) => item.unique !== true || item.partialFilterExpression !== undefined || item.sparse === true || item.collation !== undefined)) {
    throw new Error("Existing conversation index has incompatible options");
  }

  if (facebookIndexes.length === 0) {
    await collection.createIndex(FACEBOOK_CONVERSATION_UNIQUE_INDEX, { name: FACEBOOK_INDEX_NAME, unique: true, partialFilterExpression: FACEBOOK_FILTER });
  }
  if (nonFacebookIndexes.length === 0) {
    await collection.createIndex(NON_FACEBOOK_CONVERSATION_UNIQUE_INDEX, { name: NON_FACEBOOK_INDEX_NAME, unique: true, partialFilterExpression: NON_FACEBOOK_FILTER });
  }
  for (const legacy of legacyIndexes) await collection.dropIndex(legacy.name);
  return {
    createdFacebookIndex: facebookIndexes.length === 0,
    createdNonFacebookIndex: nonFacebookIndexes.length === 0,
    droppedLegacyIndex: legacyIndexes.length > 0
  };
}

export async function runFacebookConversationCustomerIndexMigration(uri: string) {
  const connection = await mongoose.createConnection(uri, { serverSelectionTimeoutMS: 5_000 }).asPromise();
  try {
    if (!connection.db) throw new Error("MongoDB connection did not provide a database handle");
    return await migrateFacebookConversationCustomerIndex(connection.db.collection("conversations"));
  } finally {
    await connection.close();
  }
}

async function runFromCommandLine(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is required");
  const result = await runFacebookConversationCustomerIndexMigration(uri);
  console.info(`Facebook conversation index migration complete: createdFacebook=${result.createdFacebookIndex}, createdNonFacebook=${result.createdNonFacebookIndex}, droppedLegacy=${result.droppedLegacyIndex}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  void runFromCommandLine().catch(() => {
    console.error("Facebook conversation index migration failed");
    process.exitCode = 1;
  });
}
