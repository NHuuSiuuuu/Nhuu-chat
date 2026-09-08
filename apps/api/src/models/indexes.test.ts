import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { CustomerModel } from "./customer.model.js";
import { MessageModel } from "./message.model.js";
import { startTestDatabase, stopTestDatabase } from "../test/mongo-repl-set.js";

describe("domain idempotency indexes", () => {
  beforeAll(async () => {
    await startTestDatabase();
    await Promise.all([CustomerModel.syncIndexes(), MessageModel.syncIndexes()]);
  }, 120_000);

  beforeEach(async () => {
    await Promise.all([CustomerModel.deleteMany({}), MessageModel.deleteMany({})]);
  });

  afterAll(async () => {
    await stopTestDatabase();
  }, 30_000);

  it("rejects duplicate platform customer identifiers", async () => {
    const customer = { name: "Nhuu", platform: "telegram", platformId: "42" };
    await CustomerModel.create(customer);

    await expect(CustomerModel.create(customer)).rejects.toMatchObject({ code: 11000 });
  });

  it("rejects duplicate external message identifiers on the same platform", async () => {
    const conversationId = new mongoose.Types.ObjectId();
    const message = {
      conversationId,
      platform: "telegram",
      externalMessageId: "message-1",
      senderType: "customer",
      senderId: "42",
      content: "Xin chào"
    };
    await MessageModel.create(message);

    await expect(MessageModel.create(message)).rejects.toMatchObject({ code: 11000 });
  });

  it("allows messages without an external identifier", async () => {
    const conversationId = new mongoose.Types.ObjectId();
    const message = {
      conversationId,
      platform: "telegram",
      senderType: "agent",
      senderId: new mongoose.Types.ObjectId().toString(),
      content: "Chào bạn"
    };

    await MessageModel.create([message, message]);

    expect(await MessageModel.countDocuments()).toBe(2);
  });
});
