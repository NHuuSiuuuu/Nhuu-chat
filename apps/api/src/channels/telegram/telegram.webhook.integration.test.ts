import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../../app.js";
import { issueTokens } from "../../services/auth.service.js";
import { ConversationModel } from "../../models/conversation.model.js";
import { CustomerModel } from "../../models/customer.model.js";
import { MessageModel } from "../../models/message.model.js";
import { ProviderSecretModel } from "../../models/provider-secret.model.js";
import { AssistantModel } from "../../models/assistant.model.js";
import { AutomationTemplateModel } from "../../models/automation-template.model.js";
import { BotProcessingModel } from "../../models/bot-processing.model.js";
import { ChatbotOrchestrator } from "../../chatbot/chatbot-orchestrator.js";
import { createProviderSecret } from "../../services/provider-secret.service.js";
import { startTestDatabase, stopTestDatabase } from "../../test/mongo-repl-set.js";

process.env.JWT_SECRET ??= "test-jwt-secret-that-is-at-least-32-characters";
process.env.ENCRYPTION_KEY ??= "test-encryption-key-that-is-at-least-32-characters";
process.env.TELEGRAM_WEBHOOK_SECRET = "telegram-webhook-secret-value";

const textUpdate = {
  update_id: 7001,
  message: {
    message_id: 99,
    date: 1_725_801_200,
    chat: { id: 456, type: "private" },
    from: {
      id: 123,
      is_bot: false,
      first_name: "Nhuu",
      last_name: "Tester",
      username: "nhuu_tester"
    },
    text: "Xin chào"
  }
};

describe("Telegram channel routes", () => {
  beforeAll(async () => {
    await startTestDatabase();
    await Promise.all([
      CustomerModel.syncIndexes(),
      ConversationModel.syncIndexes(),
      MessageModel.syncIndexes(),
      ProviderSecretModel.syncIndexes()
    ]);
  }, 120_000);

  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    await Promise.all([
      CustomerModel.deleteMany({}),
      ConversationModel.deleteMany({}),
      MessageModel.deleteMany({}),
      ProviderSecretModel.deleteMany({}),
      AssistantModel.deleteMany({}),
      AutomationTemplateModel.deleteMany({}),
      BotProcessingModel.deleteMany({})
    ]);
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    await stopTestDatabase();
  }, 30_000);

  // Dùng owner đã lưu; payload Telegram không được quyết định phạm vi trợ lý.
  async function enableBot() {
    const customer = await CustomerModel.create({ platform: "telegram", platformId: "123", name: "Khách" });
    const ownerId = "507f1f77bcf86cd799439011";
    const conversation = await ConversationModel.create({ ownerId, customerId: customer._id, platform: "telegram", channelId: "456" });
    const assistant = await AssistantModel.create({ ownerId, name: "Trợ lý", instructions: "Chỉ dùng dữ liệu cửa hàng", channelScope: { mode: "channels", identifiers: ["telegram:456"] } });
    await AutomationTemplateModel.create({ ownerId, assistantId: assistant._id, name: "Chào", keywords: ["xin chào"], responseTemplate: "Chào bạn từ cửa hàng", channelScope: { mode: "channels", identifiers: ["telegram:456"] } });
    await createProviderSecret("telegram", "bot-token", "123:test-encrypted-bot-token");
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => {
      expect(await MessageModel.countDocuments({ senderType: "customer", content: "Xin chào" })).toBe(1);
      return new Response(JSON.stringify({ ok: true, result: { message_id: 100 } }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    return { ownerId, conversation, fetchMock };
  }

  it("sends one shared bot delivery for concurrent webhook replays after persisting the customer", async () => {
    const { conversation, fetchMock } = await enableBot();
    const app = createApp();
    const path = "/api/v1/channels/telegram/webhook/telegram-webhook-secret-value";
    const responses = await Promise.all(Array.from({ length: 3 }, () => request(app).post(path).send(textUpdate)));
    expect(responses.map((response) => response.status)).toEqual([204, 204, 204]);
    expect((await request(app).post(path).send(textUpdate)).status).toBe(204);
    expect(await MessageModel.countDocuments({ senderType: "customer" })).toBe(1);
    expect(await MessageModel.countDocuments({ senderType: "bot" })).toBe(1);
    expect(await MessageModel.findOne({ senderType: "bot" }).lean()).toMatchObject({ content: "Chào bạn từ cửa hàng", externalMessageId: "100", deliveryStatus: "sent" });
    expect(await BotProcessingModel.findOne().lean()).toMatchObject({ status: "sent" });
    expect(await ConversationModel.findById(conversation._id).lean()).toMatchObject({ unreadCount: 1 });
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith("https://api.telegram.org/bot123:test-encrypted-bot-token/sendMessage", expect.objectContaining({ body: JSON.stringify({ chat_id: "456", text: "Chào bạn từ cửa hàng" }) }));
  });

  it("acknowledges connector failure and replay while retaining the customer and failed handoff", async () => {
    const { conversation, fetchMock } = await enableBot();
    fetchMock.mockRejectedValue(new Error("private connector failure"));
    const app = createApp();
    const path = "/api/v1/channels/telegram/webhook/telegram-webhook-secret-value";
    expect((await request(app).post(path).send(textUpdate)).status).toBe(204);
    expect((await request(app).post(path).send(textUpdate)).status).toBe(204);
    expect(await MessageModel.countDocuments({ senderType: "customer", deliveryStatus: "delivered" })).toBe(1);
    expect(await MessageModel.findOne({ senderType: "bot" }).lean()).toMatchObject({ deliveryStatus: "failed", metadata: { handoff: true, errorCode: "DELIVERY_FAILED" } });
    expect(await BotProcessingModel.findOne().lean()).toMatchObject({ status: "failed", errorCode: "DELIVERY_FAILED" });
    expect(await ConversationModel.findById(conversation._id).lean()).toMatchObject({ status: "open", botPausedUntil: null });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("keeps webhook acknowledgement when orchestration unexpectedly rejects after persistence", async () => {
    await enableBot();
    const process = vi.spyOn(ChatbotOrchestrator.prototype, "process").mockRejectedValue(new Error("processing unavailable"));
    const path = "/api/v1/channels/telegram/webhook/telegram-webhook-secret-value";
    expect((await request(createApp()).post(path).send(textUpdate)).status).toBe(204);
    expect((await request(createApp()).post(path).send(textUpdate)).status).toBe(204);
    expect(await MessageModel.countDocuments({ senderType: "customer" })).toBe(1);
    expect(process).toHaveBeenCalledOnce();
  });

  it.each(["rejection", "failed"])("records sanitized Bot diagnostics and handoff before claim on %s while acknowledging replay", async (kind) => {
    const { conversation, fetchMock } = await enableBot();
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    if (kind === "rejection") vi.spyOn(ChatbotOrchestrator.prototype, "process").mockRejectedValue(new Error("private-token-and-prompt"));
    else vi.spyOn(AssistantModel, "findOne").mockImplementationOnce(() => { throw new Error("private-token-and-prompt"); });
    const path = "/api/v1/channels/telegram/webhook/telegram-webhook-secret-value";
    expect((await request(createApp()).post(path).send(textUpdate)).status).toBe(204);
    const first = await MessageModel.findOne({ senderType: "customer" }).lean();
    expect(first).toMatchObject({ metadata: { botFailure: { code: "PROCESSING_FAILED" } } });
    expect(await ConversationModel.findById(conversation._id).lean()).toMatchObject({ status: "open", botPausedUntil: null });
    expect(await BotProcessingModel.countDocuments()).toBe(0);
    expect((await request(createApp()).post(path).send(textUpdate)).status).toBe(204);
    expect((await MessageModel.findOne({ senderType: "customer" }).lean())?.metadata.botFailure).toEqual(first!.metadata.botFailure);
    expect(log).toHaveBeenCalledOnce();
    expect(JSON.stringify(log.mock.calls)).toContain("PROCESSING_FAILED");
    expect(JSON.stringify(log.mock.calls)).not.toContain("private-token-and-prompt");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ignores bot-originated updates even when a channel assistant is enabled", async () => {
    const { fetchMock } = await enableBot();
    const update = { ...textUpdate, message: { ...textUpdate.message, from: { ...textUpdate.message.from, is_bot: true } } };
    expect((await request(createApp()).post("/api/v1/channels/telegram/webhook/telegram-webhook-secret-value").send(update)).status).toBe(204);
    expect(await MessageModel.countDocuments()).toBe(0);
    expect(await BotProcessingModel.countDocuments()).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["unowned", "foreign", "paused", "out-of-scope"])("does not auto-send for an %s conversation", async (kind) => {
    const { conversation, fetchMock } = await enableBot();
    if (kind === "unowned") await ConversationModel.updateOne({ _id: conversation._id }, { ownerId: null });
    if (kind === "foreign") await AssistantModel.updateMany({}, { ownerId: "507f1f77bcf86cd799439022" });
    if (kind === "paused") await ConversationModel.updateOne({ _id: conversation._id }, { botPausedUntil: new Date(Date.now() + 60_000) });
    if (kind === "out-of-scope") await AssistantModel.updateMany({}, { "channelScope.identifiers": ["telegram_personal:456"] });
    const forged = { ...textUpdate, ownerId: "507f1f77bcf86cd799439022" };
    expect((await request(createApp()).post("/api/v1/channels/telegram/webhook/telegram-webhook-secret-value").send(forged)).status).toBe(204);
    expect(await MessageModel.countDocuments({ senderType: "customer" })).toBe(1);
    expect(await BotProcessingModel.countDocuments()).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([true, false])("persists photo metadata and caption=%s before the shared text response", async (hasCaption) => {
    const { fetchMock } = await enableBot();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true, result: { message_id: 100 } }), { status: 200 }));
    const update = { ...textUpdate, message: { ...textUpdate.message, text: undefined, photo: [{ file_id: "photo-1", file_unique_id: "photo-unique", width: 100, height: 100 }], ...(hasCaption ? { caption: "Xin chào" } : {}) } };
    expect((await request(createApp()).post("/api/v1/channels/telegram/webhook/telegram-webhook-secret-value").send(update)).status).toBe(204);
    expect(await MessageModel.findOne({ senderType: "customer" }).lean()).toMatchObject({ type: "image", content: hasCaption ? "Xin chào" : "", metadata: { fileId: "photo-1" } });
    expect(await MessageModel.findOne({ senderType: "bot" }).lean()).toMatchObject({ deliveryStatus: "sent", content: hasCaption ? "Chào bạn từ cửa hàng" : expect.stringMatching(/văn bản/) });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("rejects an incorrect webhook secret without writing data", async () => {
    const response = await request(createApp())
      .post("/api/v1/channels/telegram/webhook/wrong-secret")
      .send(textUpdate);

    expect(response.status).toBe(401);
    await expect(MessageModel.countDocuments()).resolves.toBe(0);
    await expect(CustomerModel.countDocuments()).resolves.toBe(0);
    await expect(ConversationModel.countDocuments()).resolves.toBe(0);
  });

  it("persists a valid inbound message once when Telegram replays the update", async () => {
    const path = "/api/v1/channels/telegram/webhook/telegram-webhook-secret-value";

    const first = await request(createApp()).post(path).send(textUpdate);
    const replay = await request(createApp()).post(path).send(textUpdate);

    expect(first.status).toBe(204);
    expect(replay.status).toBe(204);
    await expect(CustomerModel.countDocuments()).resolves.toBe(1);
    await expect(ConversationModel.countDocuments()).resolves.toBe(1);
    await expect(MessageModel.countDocuments()).resolves.toBe(1);

    const customer = await CustomerModel.findOne().lean();
    const conversation = await ConversationModel.findOne().lean();
    const message = await MessageModel.findOne().lean();
    expect(customer).toMatchObject({
      platform: "telegram",
      platformId: "123",
      name: "Nhuu Tester"
    });
    expect(conversation).toMatchObject({
      platform: "telegram",
      channelId: "456",
      unreadCount: 1,
      lastMessageSnippet: "Xin chào"
    });
    expect(message).toMatchObject({
      platform: "telegram",
      externalMessageId: "99",
      senderType: "customer",
      senderId: "123",
      type: "text",
      content: "Xin chào",
      deliveryStatus: "delivered",
      metadata: {
        updateId: 7001,
        chatType: "private",
        senderUsername: "nhuu_tester"
      }
    });
  });

  it("acknowledges a valid unsupported update without writing data", async () => {
    const response = await request(createApp())
      .post("/api/v1/channels/telegram/webhook/telegram-webhook-secret-value")
      .send({ update_id: 7002, callback_query: { id: "callback-1" } });

    expect(response.status).toBe(204);
    await expect(MessageModel.countDocuments()).resolves.toBe(0);
  });

  it("stores the bot token encrypted and registers the authenticated webhook", async () => {
    const botToken = "123456:must-not-be-persisted";
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, result: true }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const { accessToken } = await issueTokens({
      id: "507f1f77bcf86cd799439011",
      email: "admin@example.com",
      role: "admin"
    });

    const response = await request(createApp())
      .post("/api/v1/channels/telegram")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ botToken, webhookBaseUrl: "https://chat.example.com/" });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      provider: "telegram",
      webhookUrl:
        "https://chat.example.com/api/v1/channels/telegram/webhook/telegram-webhook-secret-value"
    });
    expect(JSON.stringify(response.body)).not.toContain(botToken);
    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.telegram.org/bot${botToken}/setWebhook`,
      expect.objectContaining({
        body: JSON.stringify({
          url: response.body.webhookUrl,
          secret_token: "telegram-webhook-secret-value"
        })
      })
    );

    const stored = await ProviderSecretModel.findOne({ provider: "telegram", name: "bot-token" })
      .select("+ciphertext")
      .lean();
    expect(stored?.ciphertext).toBeTypeOf("string");
    expect(String(stored?.ownerId)).toBe("507f1f77bcf86cd799439011");
    expect(stored?.ciphertext).not.toContain(botToken);
    expect(JSON.stringify(stored)).not.toContain(botToken);
  });

  it("assigns a fresh Bot conversation to the authenticated registration owner, ignoring forged inbound owner", async () => {
    const ownerId = "507f1f77bcf86cd799439011";
    const { accessToken } = await issueTokens({ id: ownerId, email: "owner@example.com", role: "admin" });
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (url) => new Response(JSON.stringify({ ok: true, result: String(url).endsWith("setWebhook") ? true : { message_id: 100 } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();
    expect((await request(app).post("/api/v1/channels/telegram").set("Authorization", `Bearer ${accessToken}`).send({ botToken: "123:owned-token", webhookBaseUrl: "https://example.com", ownerId: "507f1f77bcf86cd799439022" })).status).toBe(201);
    const assistant = await AssistantModel.create({ ownerId, name: "Trợ lý", instructions: "Dùng mẫu", isDefault: true });
    await AutomationTemplateModel.create({ ownerId, assistantId: assistant._id, name: "Chào", keywords: ["xin chào"], responseTemplate: "Chào đúng chủ cửa hàng" });
    const path = "/api/v1/channels/telegram/webhook/telegram-webhook-secret-value";
    expect((await request(app).post(path).send({ ...textUpdate, ownerId: "507f1f77bcf86cd799439022" })).status).toBe(204);
    expect((await request(app).post(path).send(textUpdate)).status).toBe(204);
    expect(String((await ConversationModel.findOne().lean())?.ownerId)).toBe(ownerId);
    expect(await MessageModel.findOne({ senderType: "bot" }).lean()).toMatchObject({ content: "Chào đúng chủ cửa hàng", deliveryStatus: "sent" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not send another conversation owner's reply through an owned Bot registration", async () => {
    const { fetchMock } = await enableBot();
    await ProviderSecretModel.updateOne({ provider: "telegram", name: "bot-token" }, { ownerId: "507f1f77bcf86cd799439022" });
    expect((await request(createApp()).post("/api/v1/channels/telegram/webhook/telegram-webhook-secret-value").send(textUpdate)).status).toBe(204);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await MessageModel.findOne({ senderType: "bot" }).lean()).toMatchObject({ deliveryStatus: "failed" });
  });

  it.each(["document", "sticker", "audio", "voice", "video", "video_note", "animation"])("persists Bot %s with/without caption and responds without inspecting media", async (kind) => {
    const { fetchMock } = await enableBot();
    let sentId = 500;
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ ok: true, result: { message_id: sentId++ } }), { status: 200 }));
    for (const hasCaption of [true, false]) {
      const id = hasCaption ? 99 : 101;
      const update = { ...textUpdate, message: { ...textUpdate.message, message_id: id, text: undefined, [kind]: { file_id: "media-1", file_name: "media.bin", mime_type: "application/octet-stream", is_video: kind === "sticker" }, ...(hasCaption ? { caption: "Xin chào" } : {}) } };
      expect((await request(createApp()).post("/api/v1/channels/telegram/webhook/telegram-webhook-secret-value").send(update)).status).toBe(204);
      const type = ["video", "video_note", "animation", "sticker"].includes(kind) ? "video" : ["audio", "voice"].includes(kind) ? "audio" : "file";
      expect(await MessageModel.findOne({ externalMessageId: String(id) }).lean()).toMatchObject({ type, content: hasCaption ? "Xin chào" : "", metadata: { fileId: "media-1" } });
    }
    expect(await MessageModel.find({ senderType: "bot" }).sort({ createdAt: 1 }).lean()).toEqual([expect.objectContaining({ content: "Chào bạn từ cửa hàng" }), expect.objectContaining({ content: expect.stringMatching(/văn bản/) })]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
