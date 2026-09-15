import { describe, expect, it, vi } from "vitest";

import {
  LEGACY_CONVERSATION_UNIQUE_INDEX,
  OWNER_SCOPED_CONVERSATION_UNIQUE_INDEX,
  migrateConversationOwnerScopedIndex
} from "./migrate-conversation-owner-index.js";

describe("migrateConversationOwnerScopedIndex", () => {
  it("creates the owner-scoped index before dropping the legacy unique index", async () => {
    const operations: string[] = [];
    const collection = {
      listIndexes: () => ({
        toArray: async () => [
          { name: "_id_", key: { _id: 1 } },
          { name: "platform_1_channelId_1", key: LEGACY_CONVERSATION_UNIQUE_INDEX, unique: true }
        ]
      }),
      createIndex: vi.fn(async () => {
        operations.push("create");
        return "platform_1_channelId_1_ownerId_1";
      }),
      dropIndex: vi.fn(async () => {
        operations.push("drop");
      })
    };

    await expect(migrateConversationOwnerScopedIndex(collection)).resolves.toEqual({
      createdOwnerScopedIndex: true,
      droppedLegacyIndexNames: ["platform_1_channelId_1"]
    });

    expect(collection.createIndex).toHaveBeenCalledWith(OWNER_SCOPED_CONVERSATION_UNIQUE_INDEX, {
      name: "platform_1_channelId_1_ownerId_1",
      unique: true
    });
    expect(collection.dropIndex).toHaveBeenCalledWith("platform_1_channelId_1");
    expect(operations).toEqual(["create", "drop"]);
  });

  it("does not change indexes after the owner-scoped migration has already run", async () => {
    const collection = {
      listIndexes: () => ({
        toArray: async () => [
          { name: "_id_", key: { _id: 1 } },
          {
            name: "platform_1_channelId_1_ownerId_1",
            key: OWNER_SCOPED_CONVERSATION_UNIQUE_INDEX,
            unique: true
          }
        ]
      }),
      createIndex: vi.fn(),
      dropIndex: vi.fn()
    };

    await expect(migrateConversationOwnerScopedIndex(collection)).resolves.toEqual({
      createdOwnerScopedIndex: false,
      droppedLegacyIndexNames: []
    });

    expect(collection.createIndex).not.toHaveBeenCalled();
    expect(collection.dropIndex).not.toHaveBeenCalled();
  });
});
