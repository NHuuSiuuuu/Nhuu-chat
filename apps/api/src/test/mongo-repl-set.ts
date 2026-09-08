import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

let replicaSet: MongoMemoryReplSet | undefined;

export async function startTestDatabase(): Promise<void> {
  const externalUri = process.env.MONGODB_TEST_URI;
  if (externalUri) {
    await mongoose.connect(externalUri);
    return;
  }

  replicaSet = await MongoMemoryReplSet.create({
    binary: { version: "4.4.29" },
    replSet: { count: 1, storageEngine: "wiredTiger" }
  });
  await mongoose.connect(replicaSet.getUri("nhuu-chat-test"));
}

export async function stopTestDatabase(): Promise<void> {
  await mongoose.disconnect();
  await replicaSet?.stop();
  replicaSet = undefined;
}
