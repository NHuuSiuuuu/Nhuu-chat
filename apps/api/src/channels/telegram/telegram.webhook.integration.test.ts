import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../../app.js";
import { issueTokens } from "../../auth/auth.service.js";
import { ConversationModel } from "../../models/conversation.model.js";
import { CustomerModel } from "../../models/customer.model.js";
import { MessageModel } from "../../models/message.model.js";
import { ProviderSecretModel } from "../../models/provider-secret.model.js";
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
    vi.unstubAllGlobals();
    await Promise.all([
      CustomerModel.deleteMany({}),
      ConversationModel.deleteMany({}),
      MessageModel.deleteMany({}),
      ProviderSecretModel.deleteMany({})
    ]);
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await stopTestDatabase();
  }, 30_000);

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
    expect(stored?.ciphertext).not.toContain(botToken);
    expect(JSON.stringify(stored)).not.toContain(botToken);
  });
});
