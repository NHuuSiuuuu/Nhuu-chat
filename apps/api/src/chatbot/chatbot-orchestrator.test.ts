import mongoose from "mongoose";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { knowledgeEmbedding, knowledgeVectorStore } from "../ai/knowledge-runtime.js";
import { AssistantModel } from "../models/assistant.model.js";
import { BotProcessingModel } from "../models/bot-processing.model.js";
import { ConversationModel } from "../models/conversation.model.js";
import { MessageModel } from "../models/message.model.js";
import { pauseBot } from "../orchestration/bot-pause.service.js";
import { startTestDatabase, stopTestDatabase } from "../test/mongo-repl-set.js";
import { BotDeliveryService } from "./bot-delivery.service.js";
import { ChatbotOrchestrator } from "./chatbot-orchestrator.js";
import {
  fallback,
  now,
  resetBotDatabase,
  seedBotConversation,
  seedTemplate
} from "./chatbot-test-helpers.js";

beforeAll(startTestDatabase, 60_000);
afterAll(stopTestDatabase);
beforeEach(resetBotDatabase);
afterEach(() => vi.restoreAllMocks());

function harness(options: { greetingDelayMs?: number; waitForGreetingDelay?: (delayMs: number) => Promise<void> } = {}) {
  const sendText = vi.fn().mockResolvedValue({ externalMessageId: "remote-1" });
  const reply = vi
    .fn()
    .mockResolvedValue({ answer: "Có bảo hành 12 tháng.", handoff: false, sources: [] });
  const delivery = new BotDeliveryService({ resolveAdapter: () => ({ sendText }), now: () => now });
  const orchestrator = new ChatbotOrchestrator({
    delivery,
    provider: { reply },
    now: () => now,
    timeoutMs: 1_000,
    greetingDelayMs: options.greetingDelayMs ?? 0,
    waitForGreetingDelay: options.waitForGreetingDelay
  });
  return { sendText, reply, orchestrator };
}

describe("chatbot orchestration", () => {
  it("does not start provider work after retrieval has already timed out", async () => {
    const { input } = await seedBotConversation();
    let finishSearch!: () => void;
    vi.spyOn(knowledgeVectorStore, "search").mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishSearch = () => resolve([]);
        })
    );
    const { orchestrator, reply, sendText } = harness();
    expect(await orchestrator.process(input)).toEqual({ status: "sent" });
    finishSearch();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(reply).not.toHaveBeenCalled();
    expect(sendText).toHaveBeenCalledOnce();
  });

  it.each(["agent", "bot"] as const)(
    "skips normalized %s messages before claiming",
    async (senderType) => {
      const { input } = await seedBotConversation();
      const { orchestrator, sendText, reply } = harness();
      expect(await orchestrator.process({ ...input, senderType })).toEqual({ status: "skipped" });
      expect(await BotProcessingModel.countDocuments()).toBe(0);
      expect(sendText).not.toHaveBeenCalled();
      expect(reply).not.toHaveBeenCalled();
    }
  );

  it.each(["missing", "disabled", "foreign", "out-of-scope"])(
    "skips an %s assistant",
    async (kind) => {
      const { input, assistant } = await seedBotConversation();
      if (kind === "missing") await AssistantModel.deleteMany({});
      if (kind === "disabled")
        await AssistantModel.updateOne({ _id: assistant._id }, { enabled: false });
      if (kind === "foreign")
        await AssistantModel.updateOne(
          { _id: assistant._id },
          { ownerId: new mongoose.Types.ObjectId() }
        );
      if (kind === "out-of-scope")
        await AssistantModel.updateOne(
          { _id: assistant._id },
          {
            channelScope: { mode: "channels", identifiers: ["telegram:other"] }
          }
        );
      const { orchestrator, sendText } = harness();
      expect(await orchestrator.process(input)).toEqual({ status: "skipped" });
      expect(await BotProcessingModel.countDocuments()).toBe(0);
      expect(sendText).not.toHaveBeenCalled();
    }
  );

  it.each(["owner", "channel", "persisted-sender", "missing-message"])(
    "rejects a mismatched %s boundary",
    async (kind) => {
      const { input, message } = await seedBotConversation();
      if (kind === "owner") input.ownerId = String(new mongoose.Types.ObjectId());
      if (kind === "channel") input.channelId = "other";
      if (kind === "persisted-sender")
        await MessageModel.updateOne({ _id: message._id }, { senderType: "bot" });
      if (kind === "missing-message")
        input.customerMessageId = String(new mongoose.Types.ObjectId());
      expect(await harness().orchestrator.process(input)).toEqual({ status: "skipped" });
      expect(await BotProcessingModel.countDocuments()).toBe(0);
    }
  );

  it("skips paused conversations without consuming their message claim", async () => {
    const { input } = await seedBotConversation();
    await pauseBot(input.conversationId, now);
    const { orchestrator, reply, sendText } = harness();
    expect(await orchestrator.process(input)).toEqual({ status: "skipped" });
    expect(await BotProcessingModel.countDocuments()).toBe(0);
    expect(reply).not.toHaveBeenCalled();
    expect(sendText).not.toHaveBeenCalled();
  });

  it("uses a canonical channel template before RAG and sends exact text without the provider", async () => {
    const { input, assistant } = await seedBotConversation();
    await seedTemplate(input.ownerId, String(assistant._id));
    const search = vi.spyOn(knowledgeVectorStore, "search");
    const { orchestrator, reply, sendText } = harness();
    expect(await orchestrator.process(input)).toEqual({ status: "sent" });
    expect(sendText).toHaveBeenCalledExactlyOnceWith({ channelId: "42", content: "Giá 100.000đ" });
    expect(reply).not.toHaveBeenCalled();
    expect(search).not.toHaveBeenCalled();
    const bot = await MessageModel.findOne({ senderType: "bot" });
    expect(bot).toMatchObject({ content: "Giá 100.000đ", deliveryStatus: "sent" });
    expect(await BotProcessingModel.findOne()).toMatchObject({
      status: "sent",
      botMessageId: bot!._id
    });
  });

  it("waits before delivering an automatic greeting template", async () => {
    const { input, assistant } = await seedBotConversation();
    await seedTemplate(input.ownerId, String(assistant._id));
    let releaseDelay!: () => void;
    const waitForGreetingDelay = vi.fn(
      () => new Promise<void>((resolve) => { releaseDelay = resolve; })
    );
    const { orchestrator, sendText } = harness({ greetingDelayMs: 2_000, waitForGreetingDelay });

    const processing = orchestrator.process(input);
    await vi.waitFor(() => expect(waitForGreetingDelay).toHaveBeenCalledWith(2_000));
    expect(sendText).not.toHaveBeenCalled();

    releaseDelay();
    await expect(processing).resolves.toEqual({ status: "sent" });
    expect(sendText).toHaveBeenCalledOnce();
  });

  it("resolves direct assistant before default and supplies its rewrite template", async () => {
    const { input, assistant } = await seedBotConversation();
    const direct = await AssistantModel.create({
      ownerId: input.ownerId,
      name: "Trực tiếp",
      instructions: "Hướng dẫn riêng",
      channelScope: { mode: "channels", identifiers: ["telegram:42"] }
    });
    await seedTemplate(input.ownerId, String(assistant._id), {
      responseTemplate: "Wrong assistant"
    });
    await seedTemplate(input.ownerId, String(direct._id), { allowAiRewrite: true });
    const { orchestrator, reply } = harness();
    await orchestrator.process(input);
    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({
        assistant: expect.objectContaining({ instructions: "Hướng dẫn riêng" }),
        template: { responseTemplate: "Giá 100.000đ", allowAiRewrite: true },
        context: []
      })
    );
  });

  it("claims before provider work and retrieves only owner knowledge with bounded chronological history", async () => {
    const { input, assistant, message } = await seedBotConversation();
    await seedTemplate(String(new mongoose.Types.ObjectId()), String(assistant._id), {
      responseTemplate: "Foreign template"
    });
    const vector = await knowledgeEmbedding.embed("giá");
    await knowledgeVectorStore.upsert([
      {
        ownerId: input.ownerId,
        documentId: "ours",
        chunkIndex: 0,
        content: "Bảo hành 12 tháng",
        embedding: vector
      },
      {
        ownerId: "someone-else",
        documentId: "theirs",
        chunkIndex: 0,
        content: "Bí mật",
        embedding: vector
      }
    ]);
    for (let i = 0; i < 12; i++)
      await MessageModel.create({
        conversationId: input.conversationId,
        platform: "telegram",
        senderType: "agent",
        senderId: "staff",
        content: `history-${i}`,
        createdAt: new Date(message.createdAt.getTime() - (12 - i) * 1000)
      });
    const { orchestrator, reply } = harness();
    reply.mockImplementation(async (request) => {
      expect(await BotProcessingModel.countDocuments({ status: "processing" })).toBe(1);
      expect(request.context).toEqual([expect.objectContaining({ documentId: "ours" })]);
      expect(request.history.map((turn: { content: string }) => turn.content)).toEqual([
        "history-4",
        "history-5",
        "history-6",
        "history-7",
        "history-8",
        "history-9",
        "history-10",
        "history-11"
      ]);
      return { answer: "Bảo hành 12 tháng", handoff: false, sources: [] };
    });
    expect(await orchestrator.process(input)).toEqual({ status: "sent" });
    expect(reply).toHaveBeenCalledOnce();
  });

  it("claims concurrent replays once and persists exactly one bot message", async () => {
    const { input, assistant } = await seedBotConversation();
    await seedTemplate(input.ownerId, String(assistant._id));
    const { orchestrator, sendText } = harness();
    const results = await Promise.all(Array.from({ length: 8 }, () => orchestrator.process(input)));
    expect(results.filter((result) => result.status === "sent")).toHaveLength(1);
    expect(results.filter((result) => result.status === "skipped")).toHaveLength(7);
    expect(sendText).toHaveBeenCalledOnce();
    expect(await MessageModel.countDocuments({ senderType: "bot" })).toBe(1);
    expect(await BotProcessingModel.countDocuments()).toBe(1);
    expect(await harness().orchestrator.process(input)).toEqual({ status: "skipped" });
  });

  it.each(["handoff", "throw", "timeout", "empty"])(
    "uses one configured fallback without pausing when provider %s is not a customer handoff",
    async (kind) => {
      const { input } = await seedBotConversation();
      const { orchestrator, reply, sendText } = harness();
      if (kind === "handoff")
        reply.mockResolvedValue({ answer: "Untrusted handoff text", handoff: true, sources: [] });
      if (kind === "throw") reply.mockRejectedValue(new Error("secret provider failure"));
      if (kind === "timeout") reply.mockImplementation(() => new Promise(() => {}));
      if (kind === "empty") reply.mockResolvedValue({ answer: " ", handoff: false, sources: [] });
      expect(await orchestrator.process(input)).toEqual({ status: "sent" });
      expect(sendText).toHaveBeenCalledExactlyOnceWith({ channelId: "42", content: fallback });
      expect(await ConversationModel.findById(input.conversationId)).toMatchObject({
        status: "open",
        botPausedUntil: null,
        unreadCount: 1
      });
      expect(await BotProcessingModel.findOne()).toMatchObject({ status: "sent" });
      expect(await MessageModel.countDocuments({ senderType: "bot" })).toBe(1);
    }
  );

  it("pauses only when the customer selects Gặp nhân viên", async () => {
    const { input } = await seedBotConversation();
    const { orchestrator, reply, sendText } = harness();
    reply.mockResolvedValue({ answer: "Em sẽ chuyển anh/chị đến nhân viên.", handoff: false, sources: [] });

    expect(await orchestrator.process({ ...input, content: "Gặp nhân viên" })).toEqual({ status: "handed_off" });
    expect(reply).not.toHaveBeenCalled();
    expect(sendText).toHaveBeenCalledExactlyOnceWith({ channelId: "42", content: fallback });
    expect(await ConversationModel.findById(input.conversationId)).toMatchObject({
      status: "pending",
      botPausedUntil: new Date(now.getTime() + 30 * 60_000)
    });
  });

  it("keeps the bot active when the provider returns an insufficient-information fallback", async () => {
    const { input } = await seedBotConversation();
    const { orchestrator, reply, sendText } = harness();
    reply
      .mockResolvedValueOnce({ answer: fallback, handoff: false, sources: [] })
      .mockResolvedValueOnce({ answer: "Mình có thể tiếp tục hỗ trợ bạn.", handoff: false, sources: [] });

    expect(await orchestrator.process(input)).toEqual({ status: "sent" });
    expect(await ConversationModel.findById(input.conversationId)).toMatchObject({
      status: "open",
      botPausedUntil: null
    });

    const nextMessage = await MessageModel.create({
      conversationId: input.conversationId,
      platform: "telegram",
      senderType: "customer",
      senderId: "42",
      content: "hi",
      deliveryStatus: "delivered"
    });
    expect(await orchestrator.process({
      ...input,
      customerMessageId: String(nextMessage._id),
      content: "hi"
    })).toEqual({ status: "sent" });
    expect(reply).toHaveBeenCalledTimes(2);
    expect(sendText).toHaveBeenCalledTimes(2);
    expect(await ConversationModel.findById(input.conversationId)).toMatchObject({
      status: "open",
      botPausedUntil: null
    });
  });

  it("rechecks pause after a slow provider so an agent can take over", async () => {
    const { input } = await seedBotConversation();
    const { orchestrator, reply, sendText } = harness();
    reply.mockImplementation(async () => {
      await pauseBot(input.conversationId, now);
      return { answer: "Late reply", handoff: false, sources: [] };
    });
    expect(await orchestrator.process(input)).toEqual({ status: "skipped" });
    expect(sendText).not.toHaveBeenCalled();
    expect(await MessageModel.countDocuments({ senderType: "bot" })).toBe(0);
    expect(await BotProcessingModel.findOne()).toMatchObject({
      status: "failed",
      errorCode: "BOT_PAUSED"
    });
  });

  it("asks for text when media has no readable caption", async () => {
    const { input, message } = await seedBotConversation();
    await MessageModel.updateOne({ _id: message._id }, { type: "image", content: "" });
    const { orchestrator, sendText, reply } = harness();
    expect(await orchestrator.process({ ...input, type: "image", content: "" })).toEqual({
      status: "sent"
    });
    expect(sendText).toHaveBeenCalledWith({
      channelId: "42",
      content: expect.stringMatching(/văn bản/)
    });
    expect(reply).not.toHaveBeenCalled();
  });
});
