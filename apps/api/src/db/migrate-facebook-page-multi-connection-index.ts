import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import mongoose from "mongoose";

const SERVER_SELECTION_TIMEOUT_MS = 5_000;

interface IndexInfo {
  name: string;
  key: Record<string, number>;
  unique?: boolean;
}

export interface FacebookConnectionIndexCollection {
  listIndexes(): { toArray(): Promise<IndexInfo[]> };
  dropIndex(name: string): Promise<unknown>;
}

export interface FacebookConnectionIndexMigrationResult {
  legacyUniqueUserIndexes: string[];
  dropped: string[];
}

// Chỉ loại bỏ unique index đơn trên userId để cho phép nhiều Page trong cùng Workspace.
export async function migrateFacebookPageMultiConnectionIndex(
  collection: FacebookConnectionIndexCollection,
  apply = false
): Promise<FacebookConnectionIndexMigrationResult> {
  const indexes = await collection.listIndexes().toArray();
  const legacyUniqueUserIndexes = indexes.filter((index) =>
    index.unique === true && Object.keys(index.key).length === 1 && index.key.userId === 1
  ).map((index) => index.name);
  if (apply) {
    for (const name of legacyUniqueUserIndexes) await collection.dropIndex(name);
  }
  return { legacyUniqueUserIndexes, dropped: apply ? legacyUniqueUserIndexes : [] };
}

export async function runFacebookPageMultiConnectionIndexMigration(
  uri: string,
  apply = false
): Promise<FacebookConnectionIndexMigrationResult> {
  const connection = await mongoose.createConnection(uri, {
    serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS,
    autoIndex: false
  }).asPromise();
  try {
    if (!connection.db) throw new Error("MongoDB connection did not provide a database handle.");
    return await migrateFacebookPageMultiConnectionIndex(
      connection.db.collection("facebookpageconnections") as unknown as FacebookConnectionIndexCollection,
      apply
    );
  } finally {
    await connection.close();
  }
}

async function runFromCommandLine(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is required to run the Facebook Page connection migration.");
  const apply = process.argv.includes("--apply");
  const result = await runFacebookPageMultiConnectionIndexMigration(uri, apply);
  console.info(JSON.stringify({ mode: apply ? "apply" : "dry-run", ...result }, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  void runFromCommandLine().catch((error: unknown) => {
    console.error("Facebook Page connection migration failed:", error instanceof Error ? error.message : "unknown error");
    process.exitCode = 1;
  });
}
