import mongoose from "mongoose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { startTestDatabase, stopTestDatabase } from "../test/mongo-repl-set.js";

import {
  FACEBOOK_CONVERSATION_UNIQUE_INDEX,
  NON_FACEBOOK_CONVERSATION_UNIQUE_INDEX,
  migrateFacebookConversationCustomerIndex
} from "./migrate-facebook-conversation-customer-index.js";

const legacy = { platform: 1, channelId: 1, ownerId: 1 };
const facebookName = "platform_1_channelId_1_ownerId_1_customerId_1_facebook";
const nonFacebookName = "platform_1_channelId_1_ownerId_1_non_facebook";

describe("migrateFacebookConversationCustomerIndex", () => {
  it("creates both scoped indexes before dropping the legacy unique index", async () => {
    const operations: string[] = [];
    const collection = {
      listIndexes: () => ({ toArray: async () => [{ name: "platform_1_channelId_1_ownerId_1", key: legacy, unique: true }] }),
      createIndex: vi.fn(async (_key: unknown, options: { name: string }) => { operations.push(`create:${options.name}`); return options.name; }),
      dropIndex: vi.fn(async (name: string) => { operations.push(`drop:${name}`); })
    };
    await expect(migrateFacebookConversationCustomerIndex(collection)).resolves.toEqual({ createdFacebookIndex: true, createdNonFacebookIndex: true, droppedLegacyIndex: true });
    expect(collection.createIndex).toHaveBeenCalledWith(FACEBOOK_CONVERSATION_UNIQUE_INDEX, { name: facebookName, unique: true, partialFilterExpression: { platform: "facebook" } });
    expect(collection.createIndex).toHaveBeenCalledWith(NON_FACEBOOK_CONVERSATION_UNIQUE_INDEX, { name: nonFacebookName, unique: true, partialFilterExpression: { platform: { $in: ["instagram", "zalo", "telegram", "telegram_personal", "zalo_personal"] } } });
    expect(operations).toEqual([`create:${facebookName}`, `create:${nonFacebookName}`, "drop:platform_1_channelId_1_ownerId_1"]);
  });

  it("is idempotent when only the compatible scoped indexes remain", async () => {
    const collection = {
      listIndexes: () => ({ toArray: async () => [
        { name: facebookName, key: FACEBOOK_CONVERSATION_UNIQUE_INDEX, unique: true, partialFilterExpression: { platform: "facebook" } },
        { name: nonFacebookName, key: NON_FACEBOOK_CONVERSATION_UNIQUE_INDEX, unique: true, partialFilterExpression: { platform: { $in: ["instagram", "zalo", "telegram", "telegram_personal", "zalo_personal"] } } }
      ] }),
      createIndex: vi.fn(), dropIndex: vi.fn()
    };
    await expect(migrateFacebookConversationCustomerIndex(collection)).resolves.toEqual({ createdFacebookIndex: false, createdNonFacebookIndex: false, droppedLegacyIndex: false });
    expect(collection.createIndex).not.toHaveBeenCalled();
    expect(collection.dropIndex).not.toHaveBeenCalled();
  });

  it("fails without dropping legacy uniqueness if a new index has incompatible options", async () => {
    const collection = {
      listIndexes: () => ({ toArray: async () => [
        { name: "platform_1_channelId_1_ownerId_1", key: legacy, unique: true },
        { name: facebookName, key: FACEBOOK_CONVERSATION_UNIQUE_INDEX, unique: true, partialFilterExpression: { platform: "telegram" } }
      ] }),
      createIndex: vi.fn(), dropIndex: vi.fn()
    };
    await expect(migrateFacebookConversationCustomerIndex(collection)).rejects.toThrow("incompatible");
    expect(collection.createIndex).not.toHaveBeenCalled();
    expect(collection.dropIndex).not.toHaveBeenCalled();
  });

  it("keeps the legacy index if creating a replacement fails", async () => {
    const collection = {
      listIndexes: () => ({ toArray: async () => [{ name: "platform_1_channelId_1_ownerId_1", key: legacy, unique: true }] }),
      createIndex: vi.fn().mockResolvedValueOnce(facebookName).mockRejectedValueOnce(new Error("index build failed")),
      dropIndex: vi.fn()
    };
    await expect(migrateFacebookConversationCustomerIndex(collection)).rejects.toThrow("index build failed");
    expect(collection.dropIndex).not.toHaveBeenCalled();
  });
});

describe("Facebook conversation index migration against MongoDB", () => {
  beforeAll(async () => { await startTestDatabase(); });
  afterAll(async () => { await stopTestDatabase(); });

  it("replaces the legacy index, preserves non-Facebook uniqueness and reruns safely", async () => {
    const collection = mongoose.connection.db!.collection("facebook_conversation_index_migration_test");
    await collection.createIndex(legacy, { name: "platform_1_channelId_1_ownerId_1", unique: true });
    const ownerId = new mongoose.Types.ObjectId();
    await collection.insertOne({ platform: "facebook", channelId: "page-1", ownerId, customerId: new mongoose.Types.ObjectId() });
    await expect(migrateFacebookConversationCustomerIndex(collection)).resolves.toEqual({ createdFacebookIndex: true, createdNonFacebookIndex: true, droppedLegacyIndex: true });
    const firstFacebook = await collection.findOne({ platform: "facebook" });
    await collection.insertOne({ platform: "facebook", channelId: "page-1", ownerId, customerId: new mongoose.Types.ObjectId() });
    await expect(collection.insertOne({ platform: "facebook", channelId: "page-1", ownerId, customerId: firstFacebook?.customerId })).rejects.toMatchObject({ code: 11000 });
    await collection.insertOne({ platform: "telegram", channelId: "chat-1", ownerId, customerId: new mongoose.Types.ObjectId() });
    await expect(collection.insertOne({ platform: "telegram", channelId: "chat-1", ownerId, customerId: new mongoose.Types.ObjectId() })).rejects.toMatchObject({ code: 11000 });
    await expect(migrateFacebookConversationCustomerIndex(collection)).resolves.toEqual({ createdFacebookIndex: false, createdNonFacebookIndex: false, droppedLegacyIndex: false });
    await collection.drop();
  });
});
