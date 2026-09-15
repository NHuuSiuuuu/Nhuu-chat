import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import mongoose from "mongoose";

const SERVER_SELECTION_TIMEOUT_MS = 5_000;

export const LEGACY_CONVERSATION_UNIQUE_INDEX = { platform: 1, channelId: 1 };
export const OWNER_SCOPED_CONVERSATION_UNIQUE_INDEX = { platform: 1, channelId: 1, ownerId: 1 };
const OWNER_SCOPED_CONVERSATION_UNIQUE_INDEX_NAME = "platform_1_channelId_1_ownerId_1";

type ConversationIndexKey = Record<string, number>;

interface ConversationIndex {
  name: string;
  key: ConversationIndexKey;
  unique?: boolean;
  sparse?: boolean;
  partialFilterExpression?: Record<string, unknown>;
  collation?: Record<string, unknown>;
}

export interface ConversationIndexCollection {
  listIndexes: () => { toArray: () => Promise<ConversationIndex[]> };
  createIndex: (
    key: ConversationIndexKey,
    options: { name: string; unique: boolean }
  ) => Promise<string>;
  dropIndex: (name: string) => Promise<unknown>;
}

export interface ConversationOwnerIndexMigrationResult {
  createdOwnerScopedIndex: boolean;
  droppedLegacyIndexNames: string[];
}

function hasExactIndexKey(index: ConversationIndex, expected: ConversationIndexKey): boolean {
  const actualEntries = Object.entries(index.key);
  const expectedEntries = Object.entries(expected);

  return actualEntries.length === expectedEntries.length && expectedEntries.every(
    ([field, direction], position) =>
      actualEntries[position]?.[0] === field && actualEntries[position]?.[1] === direction
  );
}

// Chỉ chấp nhận index unique phủ toàn bộ collection với comparison mặc định như index migration tạo ra.
function hasCompatibleOwnerScopedOptions(index: ConversationIndex): boolean {
  return index.unique === true
    && index.sparse !== true
    && index.partialFilterExpression === undefined
    && index.collation === undefined;
}

export async function migrateConversationOwnerScopedIndex(
  collection: ConversationIndexCollection
): Promise<ConversationOwnerIndexMigrationResult> {
  const indexes = await collection.listIndexes().toArray();
  const ownerScopedIndexes = indexes.filter(
    (index) => hasExactIndexKey(index, OWNER_SCOPED_CONVERSATION_UNIQUE_INDEX)
  );
  if (ownerScopedIndexes.some((index) => !hasCompatibleOwnerScopedOptions(index))) {
    throw new Error("Existing owner-scoped conversation index has incompatible options");
  }
  const ownerScopedIndexExists = ownerScopedIndexes.length > 0;
  const legacyIndexes = indexes.filter(
    (index) => index.unique === true && hasExactIndexKey(index, LEGACY_CONVERSATION_UNIQUE_INDEX)
  );

  if (!ownerScopedIndexExists) {
    await collection.createIndex(OWNER_SCOPED_CONVERSATION_UNIQUE_INDEX, {
      name: OWNER_SCOPED_CONVERSATION_UNIQUE_INDEX_NAME,
      unique: true
    });
  }

  for (const legacyIndex of legacyIndexes) {
    await collection.dropIndex(legacyIndex.name);
  }

  return {
    createdOwnerScopedIndex: !ownerScopedIndexExists,
    droppedLegacyIndexNames: legacyIndexes.map((index) => index.name)
  };
}

export async function runConversationOwnerScopedIndexMigration(
  uri: string
): Promise<ConversationOwnerIndexMigrationResult> {
  const connection = await mongoose.createConnection(uri, {
    serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS
  }).asPromise();

  try {
    const database = connection.db;
    if (!database) {
      throw new Error("MongoDB connection did not provide a database handle.");
    }

    return await migrateConversationOwnerScopedIndex(database.collection("conversations"));
  } finally {
    await connection.close();
  }
}

async function runFromCommandLine(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is required to run the conversation index migration.");
  }

  const result = await runConversationOwnerScopedIndexMigration(uri);
  console.info(
    `Conversation owner index migration complete: created=${result.createdOwnerScopedIndex}, dropped=${result.droppedLegacyIndexNames.length}`
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  void runFromCommandLine().catch(() => {
    console.error("Conversation owner index migration failed.");
    process.exitCode = 1;
  });
}
