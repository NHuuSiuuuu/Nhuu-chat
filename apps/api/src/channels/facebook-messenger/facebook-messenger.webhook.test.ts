import mongoose from "mongoose";
import { createHmac } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const socket = vi.hoisted(() => ({ emitChatEvent: vi.fn(), emitInboxEventToRecipients: vi.fn() }));
vi.mock("../../realtime/socket.js", () => socket);

import { startTestDatabase, stopTestDatabase } from "../../test/mongo-repl-set.js";
import { FacebookPageConnectionModel } from "../../models/facebook-page-connection.model.js";
import { CustomerModel } from "../../models/customer.model.js";
import { ConversationModel } from "../../models/conversation.model.js";
import { MessageModel } from "../../models/message.model.js";
import { processMessengerWebhook } from "./facebook-messenger.webhook.js";
import { createApp } from "../../app.js";
import { listMessages } from "../../services/message.service.js";

const ownerId = new mongoose.Types.ObjectId();

function payload(message: Record<string, unknown> = { mid: "mid-1", text: "Hello" }) {
  return { object: "page", entry: [{ id: "page-1", messaging: [{ sender: { id: "psid-1" }, recipient: { id: "page-1" }, timestamp: 1720000000000, message }] }] };
}

async function connectPage(status: "connected" | "invalid" = "connected") {
  await FacebookPageConnectionModel.create({ userId: ownerId, pageId: "page-1", encryptedPageAccessToken: "fixture", status });
}

describe("processMessengerWebhook persistence", () => {
  beforeAll(async () => { await startTestDatabase(); });
  afterAll(async () => { await stopTestDatabase(); });
  beforeEach(async () => {
    vi.resetAllMocks();
    await Promise.all([FacebookPageConnectionModel.deleteMany({}), CustomerModel.deleteMany({}), ConversationModel.deleteMany({}), MessageModel.deleteMany({})]);
  });

  it("persists one Page scoped customer message and emits only its conversation events", async () => {
    await connectPage();
    await processMessengerWebhook(payload());
    const customer = await CustomerModel.findOne({ platformId: "facebook:page-1:psid-1" }).lean();
    const conversation = await ConversationModel.findOne({ platform: "facebook", channelId: "page-1", ownerId }).lean();
    const message = await MessageModel.findOne({ externalMessageId: "facebook:page-1:mid-1" }).lean();
    expect(customer).toBeTruthy();
    expect(conversation).toMatchObject({ customerId: customer?._id, unreadCount: 1, lastMessageSnippet: "Hello" });
    expect(message).toMatchObject({ conversationId: conversation?._id, senderType: "customer", senderId: "psid-1", content: "Hello" });
    expect(socket.emitChatEvent).toHaveBeenCalledWith("chat:message_received", String(conversation?._id), expect.objectContaining({ content: "Hello", senderType: "customer" }));
    expect(socket.emitInboxEventToRecipients).toHaveBeenCalledWith("chat:conversation_updated", [String(ownerId)], expect.objectContaining({ id: String(conversation?._id), unreadCount: 1 }));
  });

  it("persists image-only attachments and sticker metadata and includes them in the Socket payload", async () => {
    await connectPage();
    const imageUrl = "https://cdn.example/sticker.png";

    await processMessengerWebhook(payload({
      mid: "sticker-mid",
      attachments: [{ type: "image", payload: { url: imageUrl } }],
      sticker_id: "sticker-42"
    }));

    const message = await MessageModel.findOne({ externalMessageId: "facebook:page-1:sticker-mid" }).lean();
    expect(message).toMatchObject({
      type: "image",
      content: "",
      attachments: [{ url: imageUrl, fileType: "image/jpeg" }],
      metadata: { stickerId: "sticker-42" }
    });
    expect(socket.emitChatEvent).toHaveBeenCalledWith("chat:message_received", String(message?.conversationId), expect.objectContaining({
      attachments: [{ url: imageUrl, mimeType: "image/jpeg" }],
      stickerId: "sticker-42"
    }));
  });

  it("does not add a message or unread count on duplicate delivery", async () => {
    await connectPage();
    await processMessengerWebhook(payload());
    vi.resetAllMocks();
    await processMessengerWebhook(payload());
    expect(await MessageModel.countDocuments({})).toBe(1);
    expect((await ConversationModel.findOne({ channelId: "page-1" }).lean())?.unreadCount).toBe(1);
    expect(socket.emitChatEvent).not.toHaveBeenCalled();
    expect(socket.emitInboxEventToRecipients).not.toHaveBeenCalled();
  });

  it("keeps two PSIDs on one Page in separate conversations across retries", async () => {
    await connectPage();
    const first = payload();
    const second = { object: "page", entry: [{ id: "page-1", messaging: [{ sender: { id: "psid-2" }, recipient: { id: "page-1" }, timestamp: 1720000001000, message: { mid: "mid-2", text: "Second" } }] }] };
    await processMessengerWebhook(first);
    await processMessengerWebhook(second);
    await processMessengerWebhook(first);
    const customers = await CustomerModel.find({ platform: "facebook" }).lean();
    const conversations = await ConversationModel.find({ platform: "facebook", channelId: "page-1", ownerId }).lean();
    const messages = await MessageModel.find({ platform: "facebook" }).lean();
    expect(customers.map((item) => item.platformId).sort()).toEqual(["facebook:page-1:psid-1", "facebook:page-1:psid-2"]);
    expect(conversations).toHaveLength(2);
    expect(new Set(conversations.map((item) => String(item.customerId)))).toEqual(new Set(customers.map((item) => String(item._id))));
    expect(conversations.map((item) => item.unreadCount)).toEqual([1, 1]);
    expect(messages).toHaveLength(2);
    expect(new Set(messages.map((item) => String(item.conversationId)))).toEqual(new Set(conversations.map((item) => String(item._id))));
  });

  it("keeps the newest conversation preview when an older message arrives later", async () => {
    await connectPage();
    await processMessengerWebhook(payload());
    await processMessengerWebhook({ object: "page", entry: [{ id: "page-1", messaging: [{ sender: { id: "psid-1" }, recipient: { id: "page-1" }, timestamp: 1710000000000, message: { mid: "older-mid", text: "Earlier" } }] }] });
    expect(await MessageModel.countDocuments({})).toBe(2);
    expect(await ConversationModel.findOne({ channelId: "page-1" }).lean()).toMatchObject({ lastMessageAt: new Date(1720000000000), lastMessageSnippet: "Hello", unreadCount: 2 });
    const conversation = await ConversationModel.findOne({ channelId: "page-1" }).lean();
    expect((await MessageModel.findOne({ externalMessageId: "facebook:page-1:older-mid" }).lean())?.createdAt).toEqual(new Date(1710000000000));
    const history = await listMessages(String(conversation?._id), {});
    expect(history.messages.map((item) => item.content)).toEqual(["Earlier", "Hello"]);
    expect(history.messages.map((item) => item.createdAt)).toEqual(["2024-03-09T16:00:00.000Z", "2024-07-03T09:46:40.000Z"]);
  });

  it("ignores unknown or inactive Pages and unsupported attachments", async () => {
    await processMessengerWebhook(payload());
    await connectPage("invalid");
    await processMessengerWebhook(payload());
    await FacebookPageConnectionModel.updateOne({ pageId: "page-1" }, { status: "connected" });
    await processMessengerWebhook(payload({ mid: "photo", attachments: [{ type: "image" }] }));
    expect(await MessageModel.countDocuments({})).toBe(0);
    expect(socket.emitChatEvent).not.toHaveBeenCalled();
  });

  it("acknowledges a signed unknown Page without writing Inbox records", async () => {
    process.env.META_APP_SECRET = "integration-secret";
    const body = JSON.stringify(payload());
    const signature = `sha256=${createHmac("sha256", "integration-secret").update(body).digest("hex")}`;
    const response = await request(createApp()).post("/api/v1/webhooks/facebook/messenger").set("Content-Type", "application/json").set("X-Hub-Signature-256", signature).send(body);
    expect(response.status).toBe(200);
    expect(await MessageModel.countDocuments({})).toBe(0);
    expect(await CustomerModel.countDocuments({})).toBe(0);
  });

  it("does not duplicate an existing outbound message when its echo arrives", async () => {
    await connectPage();
    await processMessengerWebhook(payload());
    const conversation = await ConversationModel.findOne({ channelId: "page-1" });
    await MessageModel.create({ conversationId: conversation?._id, platform: "facebook", externalMessageId: "facebook:page-1:echo-1", senderType: "agent", senderId: String(ownerId), content: "Reply", deliveryStatus: "sent" });
    vi.resetAllMocks();
    await processMessengerWebhook({ object: "page", entry: [{ id: "page-1", messaging: [{ sender: { id: "page-1" }, recipient: { id: "psid-1" }, message: { mid: "echo-1", text: "Reply", is_echo: true } }] }] });
    expect(await MessageModel.countDocuments({})).toBe(2);
    expect((await ConversationModel.findById(conversation?._id).lean())?.unreadCount).toBe(1);
    expect(socket.emitChatEvent).not.toHaveBeenCalled();
  });

  it("records an unmatched Page echo once without raising unread", async () => {
    await connectPage();
    const echo = { object: "page", entry: [{ id: "page-1", messaging: [{ sender: { id: "page-1" }, recipient: { id: "psid-1" }, message: { mid: "echo-2", text: "From Page", is_echo: true } }] }] };
    await processMessengerWebhook(echo);
    await processMessengerWebhook(echo);
    expect(await MessageModel.countDocuments({ externalMessageId: "facebook:page-1:echo-2", senderType: "agent" })).toBe(1);
    expect((await ConversationModel.findOne({ channelId: "page-1" }).lean())?.unreadCount).toBe(0);
    expect(socket.emitChatEvent).toHaveBeenCalledTimes(1);
  });

  it("fails closed if legacy duplicate connected Page owners exist", async () => {
    await connectPage();
    await FacebookPageConnectionModel.collection.dropIndex("pageId_1");
    await FacebookPageConnectionModel.collection.insertOne({ userId: new mongoose.Types.ObjectId(), platform: "facebook", pageId: "page-1", encryptedPageAccessToken: "fixture", status: "connected" });
    await expect(processMessengerWebhook(payload())).rejects.toMatchObject({ code: "FACEBOOK_PAGE_OWNER_CONFLICT" });
    expect(await MessageModel.countDocuments({})).toBe(0);
    await FacebookPageConnectionModel.deleteMany({});
    await FacebookPageConnectionModel.syncIndexes();
  });
});
