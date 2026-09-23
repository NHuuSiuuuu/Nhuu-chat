import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { CustomerModel } from "./customer.model.js";
import { ConversationModel } from "./conversation.model.js";
import { FacebookPageConnectionModel } from "./facebook-page-connection.model.js";
import { MessageModel } from "./message.model.js";
import { startTestDatabase, stopTestDatabase } from "../test/mongo-repl-set.js";

describe("domain idempotency indexes", () => {
  beforeAll(async () => {
    await startTestDatabase();
    await Promise.all([CustomerModel.syncIndexes(), ConversationModel.syncIndexes(), MessageModel.syncIndexes(), FacebookPageConnectionModel.syncIndexes()]);
  }, 120_000);

  beforeEach(async () => {
    await Promise.all([CustomerModel.deleteMany({}), ConversationModel.deleteMany({}), MessageModel.deleteMany({}), FacebookPageConnectionModel.deleteMany({})]);
  });

  afterAll(async () => {
    await stopTestDatabase();
  }, 30_000);

  it("rejects duplicate platform customer identifiers", async () => {
    const customer = { name: "Nhuu", platform: "telegram", platformId: "42" };
    await CustomerModel.create(customer);

    await expect(CustomerModel.create(customer)).rejects.toMatchObject({ code: 11000 });
  });

  it("reserves a Facebook Page for one owner at the database boundary", async () => {
    const page = { pageId: "page-123", encryptedPageAccessToken: "ciphertext" };
    await FacebookPageConnectionModel.create({ ...page, userId: new mongoose.Types.ObjectId() });

    await expect(FacebookPageConnectionModel.create({
      ...page, userId: new mongoose.Types.ObjectId()
    })).rejects.toMatchObject({ code: 11000 });
    expect(await FacebookPageConnectionModel.countDocuments({ pageId: "page-123" })).toBe(1);
  });

  it("keeps Facebook customer identities separate across Pages", async () => {
    await CustomerModel.create([
      { name: "A", platform: "facebook", platformId: "facebook:page-1:psid-42" },
      { name: "B", platform: "facebook", platformId: "facebook:page-2:psid-42" }
    ]);

    expect(await CustomerModel.countDocuments({ platform: "facebook" })).toBe(2);
    await expect(CustomerModel.create({
      name: "Duplicate", platform: "facebook", platformId: "facebook:page-1:psid-42"
    })).rejects.toMatchObject({ code: 11000 });
  });

  it("allows distinct Facebook customers on one Page but still rejects duplicate threads", async () => {
    const ownerId = new mongoose.Types.ObjectId();
    const firstCustomer = new mongoose.Types.ObjectId();
    const secondCustomer = new mongoose.Types.ObjectId();
    const first = { platform: "facebook", channelId: "page-1", ownerId, customerId: firstCustomer };
    await ConversationModel.create(first);
    await ConversationModel.create({ ...first, customerId: secondCustomer });
    await expect(ConversationModel.create(first)).rejects.toMatchObject({ code: 11000 });
    expect(await ConversationModel.countDocuments({ platform: "facebook", channelId: "page-1", ownerId })).toBe(2);
  });

  it("retains non-Facebook uniqueness by platform, channel and owner", async () => {
    const ownerId = new mongoose.Types.ObjectId();
    const first = { platform: "telegram", channelId: "chat-1", ownerId, customerId: new mongoose.Types.ObjectId() };
    await ConversationModel.create(first);
    await expect(ConversationModel.create({ ...first, customerId: new mongoose.Types.ObjectId() })).rejects.toMatchObject({ code: 11000 });
  });

  it("deduplicates Facebook message IDs within a Page namespace", async () => {
    const message = {
      conversationId: new mongoose.Types.ObjectId(), platform: "facebook",
      externalMessageId: "facebook:page-1:mid-42", senderType: "customer",
      senderId: "facebook:page-1:psid-42", content: "Hello"
    };
    await MessageModel.create(message);
    await expect(MessageModel.create(message)).rejects.toMatchObject({ code: 11000 });
    await MessageModel.create({ ...message, externalMessageId: "facebook:page-2:mid-42" });
    expect(await MessageModel.countDocuments({ platform: "facebook" })).toBe(2);
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

  it("normalizes empty external identifiers as missing", async () => {
    const conversationId = new mongoose.Types.ObjectId();
    const message = {
      conversationId,
      platform: "telegram",
      externalMessageId: "",
      senderType: "customer",
      senderId: "42",
      content: "Không có id ngoài"
    };

    await MessageModel.create([message, message]);

    expect(await MessageModel.countDocuments()).toBe(2);
  });
});
