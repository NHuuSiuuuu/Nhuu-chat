import mongoose from "mongoose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { startTestDatabase, stopTestDatabase } from "../test/mongo-repl-set.js";
import { migrateInstagramConversationCustomerIndex } from "./migrate-instagram-conversation-customer-index.js";

const oldKey = { platform: 1, channelId: 1, ownerId: 1 };
const oldName = "platform_1_channelId_1_ownerId_1_non_facebook";
const oldFilter = { platform: { $in: ["instagram", "zalo", "telegram", "telegram_personal", "zalo_personal"] } };

describe("Instagram conversation index migration", () => {
  beforeAll(async () => { await startTestDatabase(); }, 120_000);
  afterAll(async () => { await stopTestDatabase(); }, 30_000);

  it("preserves Facebook and other platform uniqueness while allowing separate Instagram DMs", async () => {
    const collection = mongoose.connection.db!.collection("instagram_migration_mixed_test");
    await collection.createIndex(oldKey, { name: oldName, unique: true, partialFilterExpression: oldFilter });
    const facebookKey = { platform: 1, channelId: 1, ownerId: 1, customerId: 1 };
    await collection.createIndex(facebookKey, { name: "platform_1_channelId_1_ownerId_1_customerId_1_facebook", unique: true, partialFilterExpression: { platform: "facebook" } });
    const ownerId = new mongoose.Types.ObjectId();
    const firstCustomer = new mongoose.Types.ObjectId();
    await collection.insertMany([
      { platform: "facebook", channelId: "page", ownerId, customerId: firstCustomer },
      { platform: "telegram", channelId: "chat", ownerId, customerId: firstCustomer },
      { platform: "instagram", channelId: "account", ownerId, customerId: firstCustomer }
    ]);
    expect(await migrateInstagramConversationCustomerIndex(collection)).toMatchObject({ createdInstagramIndex: true, createdOtherIndex: true, droppedOldIndex: true, duplicates: [] });
    await collection.insertOne({ platform: "instagram", channelId: "account", ownerId, customerId: new mongoose.Types.ObjectId() });
    await expect(collection.insertOne({ platform: "instagram", channelId: "account", ownerId, customerId: firstCustomer })).rejects.toMatchObject({ code: 11000 });
    await expect(collection.insertOne({ platform: "telegram", channelId: "chat", ownerId, customerId: new mongoose.Types.ObjectId() })).rejects.toMatchObject({ code: 11000 });
    await collection.insertOne({ platform: "facebook", channelId: "page", ownerId, customerId: new mongoose.Types.ObjectId() });
    await expect(collection.insertOne({ platform: "facebook", channelId: "page", ownerId, customerId: firstCustomer })).rejects.toMatchObject({ code: 11000 });
    expect(await migrateInstagramConversationCustomerIndex(collection)).toMatchObject({ createdInstagramIndex: false, createdOtherIndex: false, droppedOldIndex: false, duplicates: [] });
    await collection.drop();
  });

  it("reports duplicate Instagram tuple IDs before changing indexes or records", async () => {
    const collection = mongoose.connection.db!.collection("instagram_migration_duplicates_test");
    const ownerId = new mongoose.Types.ObjectId();
    const customerId = new mongoose.Types.ObjectId();
    const ids = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
    await collection.insertMany(ids.map((_id) => ({ _id, platform: "instagram", channelId: "account", ownerId, customerId })));
    const before = await collection.listIndexes().toArray();
    const result = await migrateInstagramConversationCustomerIndex(collection);
    expect(result).toMatchObject({ createdInstagramIndex: false, createdOtherIndex: false, droppedOldIndex: false });
    expect(result.duplicates).toEqual([{ platform: "instagram", channelId: "account", ownerId, customerId, ids }]);
    expect(await collection.listIndexes().toArray()).toEqual(before);
    expect(await collection.countDocuments()).toBe(2);
    await collection.drop();
  });

  it("creates indexes for an empty collection and safely reruns", async () => {
    const collection = mongoose.connection.db!.collection("instagram_migration_empty_test");
    expect(await migrateInstagramConversationCustomerIndex(collection)).toMatchObject({ createdInstagramIndex: true, createdOtherIndex: true, droppedOldIndex: false, duplicates: [] });
    expect(await migrateInstagramConversationCustomerIndex(collection)).toMatchObject({ createdInstagramIndex: false, createdOtherIndex: false, droppedOldIndex: false, duplicates: [] });
    await collection.drop();
  });

  it("stops before mutation when the old index definition is incompatible", async () => {
    const collection = mongoose.connection.db!.collection("instagram_migration_incompatible_test");
    await collection.createIndex(oldKey, { name: oldName, unique: true, partialFilterExpression: { platform: "instagram" } });
    await expect(migrateInstagramConversationCustomerIndex(collection)).rejects.toThrow("incompatible");
    expect((await collection.listIndexes().toArray()).map((index) => index.name)).toEqual(["_id_", oldName]);
    await collection.drop();
  });

  it("rejects an unexpected owner-scoped unique index that would still block Instagram DMs", async () => {
    const collection = mongoose.connection.db!.collection("instagram_migration_unexpected_index_test");
    await collection.createIndex(oldKey, { name: "unexpected_owner_unique", unique: true });
    await expect(migrateInstagramConversationCustomerIndex(collection)).rejects.toThrow("incompatible");
    expect((await collection.listIndexes().toArray()).map((index) => index.name)).toEqual(["_id_", "unexpected_owner_unique"]);
    await collection.drop();
  });
});
