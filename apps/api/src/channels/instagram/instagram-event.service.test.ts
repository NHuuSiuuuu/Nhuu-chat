import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const socket = vi.hoisted(() => ({ emitChatEvent: vi.fn(), emitInboxEventToRecipients: vi.fn() }));
vi.mock("../../realtime/socket.js", () => socket);

import { startTestDatabase, stopTestDatabase } from "../../test/mongo-repl-set.js";
import { InstagramAccountConnectionModel } from "../../models/instagram-account-connection.model.js";
import { CustomerModel } from "../../models/customer.model.js";
import { ConversationModel } from "../../models/conversation.model.js";
import { MessageModel } from "../../models/message.model.js";
import { processInstagramWebhook } from "./instagram-event.service.js";

const ownerId = new mongoose.Types.ObjectId();
function event(igsid = "igsid-1", mid = "mid-1", text = "Hello") {
  return { object: "instagram", entry: [{ id: "ig-account-1", messaging: [{ sender: { id: igsid }, recipient: { id: "ig-account-1" }, timestamp: 1720000000000, message: { mid, text } }] }] };
}
async function connect(status: "connected" | "invalid" = "connected") {
  await InstagramAccountConnectionModel.create({ ownerUserId: ownerId, instagramUserId: "ig-account-1", encryptedAccessToken: "fixture", status });
}

describe("Instagram event persistence", () => {
  beforeAll(async () => { await startTestDatabase(); });
  afterAll(async () => { await stopTestDatabase(); });
  beforeEach(async () => {
    vi.resetAllMocks();
    await Promise.all([InstagramAccountConnectionModel.deleteMany({}), CustomerModel.deleteMany({}), ConversationModel.deleteMany({}), MessageModel.deleteMany({})]);
  });

  it("normalizes text DMs to an account scoped customer, conversation, and message", async () => {
    await connect();
    await processInstagramWebhook(event());
    const customer = await CustomerModel.findOne({ platformId: "instagram:ig-account-1:igsid-1" }).lean();
    const conversation = await ConversationModel.findOne({ platform: "instagram", channelId: "ig-account-1", ownerId }).lean();
    const message = await MessageModel.findOne({ externalMessageId: "instagram:ig-account-1:mid-1" }).lean();
    expect(customer).toBeTruthy();
    expect(conversation).toMatchObject({ customerId: customer?._id, unreadCount: 1, lastMessageSnippet: "Hello" });
    expect(message).toMatchObject({ conversationId: conversation?._id, senderType: "customer", senderId: "igsid-1", content: "Hello" });
  });

  it("preserves leading and trailing text whitespace", async () => {
    await connect();
    await processInstagramWebhook(event("igsid-1", "mid-space", "  Keep spaces  "));
    expect((await MessageModel.findOne({ externalMessageId: "instagram:ig-account-1:mid-space" }).lean())?.content).toBe("  Keep spaces  ");
  });

  it("acknowledges attachment-only batches as unsupported no-ops", async () => {
    await connect();
    await expect(processInstagramWebhook({
      object: "instagram",
      entry: [{ id: "ig-account-1", messaging: [{ sender: { id: "igsid-1" }, recipient: { id: "ig-account-1" }, message: { mid: "photo-1", attachments: [{ type: "image" }] } }] }]
    })).resolves.toBeUndefined();
    expect(await CustomerModel.countDocuments({ platform: "instagram" })).toBe(0);
    expect(await ConversationModel.countDocuments({ platform: "instagram" })).toBe(0);
    expect(await MessageModel.countDocuments({ platform: "instagram" })).toBe(0);
    expect(socket.emitChatEvent).not.toHaveBeenCalled();
    expect(socket.emitInboxEventToRecipients).not.toHaveBeenCalled();
  });

  it("keeps multiple customers on one account in separate conversations", async () => {
    await connect();
    await processInstagramWebhook(event("igsid-1", "mid-1"));
    await processInstagramWebhook(event("igsid-2", "mid-2", "Second"));
    expect(await CustomerModel.countDocuments({ platform: "instagram" })).toBe(2);
    expect(await ConversationModel.countDocuments({ platform: "instagram", channelId: "ig-account-1" })).toBe(2);
  });

  it("makes repeated deliveries idempotent and emits only once", async () => {
    await connect();
    await processInstagramWebhook(event());
    vi.resetAllMocks();
    await processInstagramWebhook(event());
    expect(await MessageModel.countDocuments({ platform: "instagram" })).toBe(1);
    expect((await ConversationModel.findOne({ channelId: "ig-account-1" }).lean())?.unreadCount).toBe(1);
    expect(socket.emitChatEvent).not.toHaveBeenCalled();
    expect(socket.emitInboxEventToRecipients).not.toHaveBeenCalled();
  });

  it("rejects unknown accounts without persisting messages", async () => {
    await expect(processInstagramWebhook(event())).rejects.toMatchObject({ code: "INSTAGRAM_ACCOUNT_NOT_FOUND" });
    expect(await MessageModel.countDocuments({})).toBe(0);
  });

  it("rejects accounts whose status is not connected", async () => {
    await connect("invalid");
    await expect(processInstagramWebhook(event())).rejects.toMatchObject({ code: "INSTAGRAM_ACCOUNT_NOT_FOUND" });
    expect(await MessageModel.countDocuments({})).toBe(0);
  });

  it("routes Inbox updates through the Workspace authorized-recipient helper", async () => {
    await connect();
    await processInstagramWebhook(event());
    expect(socket.emitInboxEventToRecipients).toHaveBeenCalledWith(
      "chat:conversation_updated", [String(ownerId)], expect.objectContaining({ platform: "instagram", channelId: "ig-account-1" })
    );
    expect(socket.emitChatEvent).toHaveBeenCalledWith("chat:message_received", expect.any(String), expect.objectContaining({ platform: "instagram" }));
  });

  it("records account echoes as sent agent messages without incrementing unread", async () => {
    await connect();
    await processInstagramWebhook({ object: "instagram", entry: [{ id: "ig-account-1", messaging: [{ sender: { id: "ig-account-1" }, recipient: { id: "igsid-1" }, message: { mid: "echo-1", text: "Reply", is_echo: true } }] }] });
    expect(await MessageModel.findOne({ externalMessageId: "instagram:ig-account-1:echo-1" }).lean()).toMatchObject({ senderType: "agent", deliveryStatus: "sent" });
    expect((await ConversationModel.findOne({ channelId: "ig-account-1" }).lean())?.unreadCount).toBe(0);
  });

  it("rejects malformed roots and non-messaging entry batches", async () => {
    await connect();
    await expect(processInstagramWebhook({ object: "page", entry: [] })).rejects.toMatchObject({ code: "INSTAGRAM_WEBHOOK_PAYLOAD_INVALID" });
    await expect(processInstagramWebhook({ object: "instagram", entry: [{ id: "ig-account-1", changes: [] }] })).rejects.toMatchObject({ code: "INSTAGRAM_WEBHOOK_PAYLOAD_INVALID" });
  });
});
