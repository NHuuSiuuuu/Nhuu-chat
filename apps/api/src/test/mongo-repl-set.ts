import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

let replicaSet: MongoMemoryReplSet | undefined;

export async function startTestDatabase(): Promise<void> {
  const externalUri = process.env.MONGODB_TEST_URI;
  if (externalUri) {
    try {
      await mongoose.connect(externalUri, { serverSelectionTimeoutMS: 5_000 });
      return;
    } catch (error) {
      throw new Error(
        `MONGODB_TEST_URI is unreachable; start the Mongo replica set first. Original error: ${
          error instanceof Error ? error.message : "unknown error"
        }`
      );
    }
  }

  try {
    replicaSet = await MongoMemoryReplSet.create({
      binary: { version: "7.0.14" },
      replSet: { count: 1, storageEngine: "wiredTiger" }
    });
    await mongoose.connect(replicaSet.getUri("nhuu-chat-test"));
  } catch (error) {
    await replicaSet?.stop().catch(() => undefined);
    replicaSet = undefined;
    throw new Error(
      `No usable Mongo test database. Set MONGODB_TEST_URI to a Docker replica set or provide a compatible MongoMemoryReplSet runtime. Original error: ${
        error instanceof Error ? error.message : "unknown error"
      }`
    );
  }
}

export async function stopTestDatabase(): Promise<void> {
  await mongoose.disconnect();
  await replicaSet?.stop();
  replicaSet = undefined;
}
