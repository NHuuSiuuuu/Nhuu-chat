import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ingestTelegramUpdate, orchestrateTelegramReply } from "../../services/telegram.service.js";
import { startTestDatabase, stopTestDatabase } from "../../test/mongo-repl-set.js";
import { resetBotDatabase, seedBotConversation } from "../../chatbot/chatbot-test-helpers.js";
import { knowledgeEmbedding, knowledgeVectorStore } from "../../ai/knowledge-runtime.js";
import { GeminiBotProvider } from "../../chatbot/gemini-bot.provider.js";
import { createProviderSecret } from "../../services/provider-secret.service.js";
import { MessageModel } from "../../models/message.model.js";
import { ProviderSecretModel } from "../../models/provider-secret.model.js";
import { resolveTelegramBotAdapter } from "../../chatbot/telegram-chatbot.js";

vi.mock("@nhuu-chat/config", () => ({ env: {} }));

describe("Telegram webhook bot orchestration", () => {
  const inbound = {
    conversationId: "conversation-1", channelId: "123", content: "Giờ mở cửa?"
  };

  it("does not call RAG or enqueue a bot reply while the bot is paused", async () => {
    const answer = vi.fn();
    const enqueue = vi.fn();

    await orchestrateTelegramReply({
      ...inbound,
      botPausedUntil: new Date("2026-09-09T10:30:00.000Z")
    }, {
      now: () => new Date("2026-09-09T10:00:00.000Z"),
      answer,
      createBotMessage: vi.fn(),
      enqueue
    });

    expect(answer).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("creates and enqueues a grounded bot reply when active", async () => {
    const enqueue = vi.fn().mockResolvedValue("job-1");
    const createBotMessage = vi.fn().mockResolvedValue({ id: "message-1" });

    await orchestrateTelegramReply({ ...inbound, botPausedUntil: null }, {
      now: () => new Date("2026-09-09T10:00:00.000Z"),
      answer: vi.fn().mockResolvedValue({ answer: "Mở cửa lúc 8 giờ", handoff: false, sources: [] }),
      createBotMessage,
      enqueue
    });

    expect(createBotMessage).toHaveBeenCalledWith(inbound, "Mở cửa lúc 8 giờ");
    expect(enqueue).toHaveBeenCalledWith({
      messageId: "message-1", conversationId: "conversation-1", platform: "telegram",
      channelId: "123", content: "Mở cửa lúc 8 giờ"
    });
  });
});

describe("Telegram inbound owner-scoped RAG", () => {
  beforeAll(startTestDatabase, 120_000);
  beforeEach(async () => {
    await resetBotDatabase();
    await ProviderSecretModel.deleteMany({});
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  afterAll(stopTestDatabase);

  it.each(["facebook", "instagram", "zalo"])("does not register an automatic sender for %s", async (platform) => {
    expect(await resolveTelegramBotAdapter({ ownerId: "507f1f77bcf86cd799439011", platform, channelId: "42" })).toBeUndefined();
  });

  it("uses the persisted conversation owner for retrieval before sending through the encrypted bot connector", async () => {
    const { input } = await seedBotConversation();
    const embedding = await knowledgeEmbedding.embed("giá");
    await knowledgeVectorStore.upsert([
      { ownerId: input.ownerId, documentId: "our-price", chunkIndex: 0, content: "Giá 100.000đ", embedding },
      { ownerId: "foreign-owner", documentId: "private-price", chunkIndex: 0, content: "Bí mật cửa hàng khác", embedding }
    ]);
    const reply = vi.spyOn(GeminiBotProvider.prototype, "reply").mockImplementation(async (request) => {
      expect(request.assistant).toMatchObject({ ownerId: input.ownerId });
      expect(request.context).toEqual([expect.objectContaining({ documentId: "our-price", content: "Giá 100.000đ" })]);
      expect(await MessageModel.findOne({ externalMessageId: "99", senderType: "customer" }).lean()).toMatchObject({ content: "giá" });
      return { answer: "Giá 100.000đ", handoff: false, sources: [{ documentId: "our-price", chunkIndex: 0 }] };
    });
    await createProviderSecret("telegram", "bot-token", "123:rag-test-token");
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ ok: true, result: { message_id: 100 } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await ingestTelegramUpdate({ update_id: 1, message: { message_id: 99, date: 1_725_801_200, chat: { id: 42, type: "private" }, from: { id: 42, is_bot: false, first_name: "Khách" }, text: "giá" } });
    expect(await MessageModel.findOne({ senderType: "bot" }).lean()).toMatchObject({ content: "Giá 100.000đ", deliveryStatus: "sent" });
    expect(reply).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
