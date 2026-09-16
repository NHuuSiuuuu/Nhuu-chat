import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { BotProcessingModel } from "../models/bot-processing.model.js";
import { ConversationModel } from "../models/conversation.model.js";
import { MessageModel } from "../models/message.model.js";
import { pauseBot } from "../orchestration/bot-pause.service.js";
import type { ChannelBotAdapter } from "./channel-bot-adapter.js";
import { startTestDatabase, stopTestDatabase } from "../test/mongo-repl-set.js";
import { BotDeliveryService } from "./bot-delivery.service.js";
import { now, resetBotDatabase, seedBotConversation } from "./chatbot-test-helpers.js";
import { sendOutboundMessage } from "../services/message.service.js";
import { createProviderSecret } from "../services/provider-secret.service.js";
import { ProviderSecretModel } from "../models/provider-secret.model.js";

const realtime = vi.hoisted(() => ({
  emitChatEvent: vi.fn(),
  emitInboxEventToRecipients: vi.fn()
}));
vi.mock("../realtime/socket.js", () => realtime);

beforeAll(startTestDatabase, 60_000);
afterAll(stopTestDatabase);
beforeEach(async () => {
  vi.clearAllMocks();
  await resetBotDatabase();
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function arrange() {
  const { input, assistant } = await seedBotConversation();
  const processing = await BotProcessingModel.create({
    ...input,
    assistantId: assistant._id,
    status: "processing"
  });
  const sendText = vi.fn().mockResolvedValue({ externalMessageId: "remote-42" });
  const service = new BotDeliveryService({
    resolveAdapter: () => ({ sendText }),
    now: () => now,
    timeoutMs: 30
  });
  const command = {
    ...input,
    processingId: String(processing._id),
    assistantId: String(assistant._id),
    content: "Xin chào",
    handoff: false
  };
  return { input, processing, command, sendText, service };
}

describe("bot delivery", () => {
  it("serializes the final pause read and bot send with a committed web agent takeover", async () => {
    const { command, sendText } = await arrange();
    await ProviderSecretModel.deleteMany({});
    await createProviderSecret("telegram", "bot-token", "123:coordination-test");
    let humanSent = false;
    let botAfterTakeover = false;
    vi.stubGlobal("fetch", vi.fn(async () => {
      humanSent = true;
      return new Response(JSON.stringify({ ok: true, result: { message_id: 300 } }), { status: 200 });
    }));
    sendText.mockImplementation(async () => {
      botAfterTakeover = humanSent;
      return { externalMessageId: "remote-42" };
    });
    let readReady!: () => void;
    const ready = new Promise<void>((resolve) => { readReady = resolve; });
    let resume!: () => void;
    const gate = new Promise<void>((resolve) => { resume = resolve; });
    const findOne = ConversationModel.findOne.bind(ConversationModel);
    let reads = 0;
    vi.spyOn(ConversationModel, "findOne").mockImplementation((...args: Parameters<typeof findOne>) => {
      const query = findOne(...args);
      if (++reads === 2) {
        const exec = query.exec.bind(query);
        vi.spyOn(query, "exec").mockImplementationOnce(async () => {
          const snapshot = await exec();
          readReady();
          await gate;
          return snapshot;
        });
      }
      return query;
    });
    const service = new BotDeliveryService({ resolveAdapter: () => ({ sendText }), now: () => now, timeoutMs: 2000 });
    const bot = service.deliver(command);
    await ready;
    const human = sendOutboundMessage({ conversationId: command.conversationId, content: "Nhân viên tiếp nhận" }, { id: command.ownerId, email: "owner@example.com", role: "admin" });
    await Promise.race([human, new Promise((resolve) => setTimeout(resolve, 150))]);
    resume();
    await Promise.all([bot, human]);
    expect(humanSent).toBe(true);
    expect(botAfterTakeover).toBe(false);
    expect(sendText.mock.calls.length).toBeLessThanOrEqual(1);
    expect(await service.deliver(command)).toEqual({ status: "skipped" });
  });
  it.each(["conversation lookup", "reservation"])(
    "terminates the claim and hands off after a transient %s failure before reservation",
    async (stage) => {
      const { command, service, sendText } = await arrange();
      if (stage === "conversation lookup") {
        vi.spyOn(ConversationModel, "findOne").mockImplementationOnce(() => {
          throw new Error("transient lookup failure");
        });
      } else {
        vi.spyOn(BotProcessingModel, "findOneAndUpdate").mockImplementationOnce(() => {
          throw new Error("transient reservation failure");
        });
      }

      expect(await service.deliver(command)).toEqual({ status: "failed" });
      expect(await BotProcessingModel.findById(command.processingId)).toMatchObject({
        status: "failed",
        errorCode: "PERSISTENCE_FAILED"
      });
      expect(await ConversationModel.findById(command.conversationId)).toMatchObject({
        status: "open",
        botPausedUntil: null
      });
      expect(await service.deliver(command)).toEqual({ status: "skipped" });
      expect(await MessageModel.countDocuments({ senderType: "bot" })).toBe(0);
      expect(sendText).not.toHaveBeenCalled();
      expect(realtime.emitChatEvent).not.toHaveBeenCalled();
      expect(realtime.emitInboxEventToRecipients).not.toHaveBeenCalled();
    }
  );

  it("does not overwrite or pause a concurrent reservation winner during pre-reservation recovery", async () => {
    const { command, service, sendText } = await arrange();
    let failLookup!: (error: Error) => void;
    const lookup = new Promise<never>((_resolve, reject) => {
      failLookup = reject;
    });
    const failedLookup = ConversationModel.findOne({ _id: command.conversationId });
    vi.spyOn(failedLookup, "exec").mockImplementationOnce(() => lookup);
    vi.spyOn(ConversationModel, "findOne").mockReturnValueOnce(failedLookup);
    const loser = service.deliver(command);

    let reachedAdapter!: () => void;
    const adapterReached = new Promise<void>((resolve) => {
      reachedAdapter = resolve;
    });
    let releaseAdapter!: (adapter: ChannelBotAdapter) => void;
    const adapter = new Promise<ChannelBotAdapter>((resolve) => {
      releaseAdapter = resolve;
    });
    const winnerService = new BotDeliveryService({
      resolveAdapter: () => {
        reachedAdapter();
        return adapter;
      },
      now: () => now,
      timeoutMs: 1_000
    });
    const winner = winnerService.deliver(command);
    await adapterReached;
    const reserved = await BotProcessingModel.findById(command.processingId).lean();
    failLookup(new Error("transient lookup failure"));
    expect(await loser).toEqual({ status: "failed" });
    const afterRecovery = await BotProcessingModel.findById(command.processingId).lean();
    expect(afterRecovery).toMatchObject({
      status: "processing",
      botMessageId: reserved!.botMessageId
    });
    expect(afterRecovery!.errorCode).toBeUndefined();
    expect(await ConversationModel.findById(command.conversationId)).toMatchObject({
      status: "open",
      botPausedUntil: null
    });
    releaseAdapter({ sendText });
    expect(await winner).toEqual({ status: "sent" });
    expect(await BotProcessingModel.findById(command.processingId)).toMatchObject({
      status: "sent"
    });
    expect(sendText).toHaveBeenCalledOnce();
    expect(await MessageModel.countDocuments({ senderType: "bot" })).toBe(1);
  });

  it("does not start a late send after adapter resolution has already timed out", async () => {
    const { command, sendText } = await arrange();
    let resolveAdapter!: (adapter: ChannelBotAdapter) => void;
    const pending = new Promise<ChannelBotAdapter>((resolve) => {
      resolveAdapter = resolve;
    });
    const service = new BotDeliveryService({
      resolveAdapter: () => pending,
      now: () => now,
      timeoutMs: 10
    });
    expect(await service.deliver(command)).toEqual({ status: "failed" });
    resolveAdapter({ sendText });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(sendText).not.toHaveBeenCalled();
  });

  it("rechecks agent pause after resolving a slow adapter", async () => {
    const { command, sendText } = await arrange();
    const service = new BotDeliveryService({
      resolveAdapter: async () => {
        await pauseBot(command.conversationId, now);
        return { sendText };
      },
      now: () => now
    });
    expect(await service.deliver(command)).toEqual({ status: "failed" });
    expect(sendText).not.toHaveBeenCalled();
  });

  it("does not shorten a longer existing agent pause", async () => {
    const { command } = await arrange();
    await pauseBot(command.conversationId, now, 60);
    await pauseBot(command.conversationId, now, 30);
    expect(await ConversationModel.findById(command.conversationId)).toMatchObject({
      botPausedUntil: new Date(now.getTime() + 3_600_000)
    });
  });

  it("persists pending before sending and emits only after final message, processing and conversation writes", async () => {
    const { command, service, sendText } = await arrange();
    sendText.mockImplementation(async () => {
      expect(await MessageModel.findOne({ senderType: "bot" })).toMatchObject({
        deliveryStatus: "pending"
      });
      expect(realtime.emitChatEvent).not.toHaveBeenCalled();
      return { externalMessageId: "remote-42" };
    });
    const snapshots: Promise<unknown>[] = [];
    realtime.emitChatEvent.mockImplementation(() => {
      snapshots.push(
        Promise.all([
          MessageModel.findOne({ senderType: "bot" }).lean(),
          BotProcessingModel.findById(command.processingId).lean(),
          ConversationModel.findById(command.conversationId).lean()
        ])
      );
    });
    expect(await service.deliver(command)).toEqual({ status: "sent" });
    const [message, processing, conversation] = (await snapshots[0]) as Array<
      Record<string, unknown>
    >;
    expect(message).toMatchObject({
      senderType: "bot",
      senderId: command.assistantId,
      deliveryStatus: "sent",
      externalMessageId: "remote-42"
    });
    expect(processing).toMatchObject({ status: "sent", botMessageId: message._id });
    expect(conversation).toMatchObject({
      lastMessageSnippet: "Xin chào",
      lastMessageAt: now,
      unreadCount: 2
    });
    expect(realtime.emitChatEvent).toHaveBeenCalledWith(
      "chat:message_received",
      command.conversationId,
      expect.objectContaining({ senderType: "bot", deliveryStatus: "sent" })
    );
    expect(realtime.emitInboxEventToRecipients).toHaveBeenCalledWith(
      "chat:conversation_updated",
      expect.arrayContaining([command.ownerId]),
      expect.objectContaining({ lastMessageSnippet: "Xin chào" })
    );
  });

  it("reserves a single bot message even when delivery is called concurrently", async () => {
    const { command, service, sendText } = await arrange();
    const results = await Promise.all([service.deliver(command), service.deliver(command)]);
    expect(results.map((result) => result.status).sort()).toEqual(["sent", "skipped"]);
    expect(sendText).toHaveBeenCalledOnce();
    expect(await MessageModel.countDocuments({ senderType: "bot" })).toBe(1);
  });

  it.each(["missing", "throws", "timeout", "resolve-throws"])(
    "records %s adapter failure without pausing or resending",
    async (kind) => {
      const { command, sendText } = await arrange();
      if (kind === "throws") sendText.mockRejectedValue(new Error("token=secret"));
      if (kind === "timeout") sendText.mockImplementation(() => new Promise(() => {}));
      const service = new BotDeliveryService({
        resolveAdapter: () => {
          if (kind === "resolve-throws") throw new Error("secret resolver error");
          return kind === "missing" ? undefined : { sendText };
        },
        now: () => now,
        timeoutMs: 30
      });
      expect(await service.deliver(command)).toEqual({ status: "failed" });
      expect(await service.deliver(command)).toEqual({ status: "skipped" });
      expect(sendText.mock.calls.length).toBeLessThanOrEqual(1);
      expect(await MessageModel.countDocuments({ senderType: "bot" })).toBe(1);
      expect(await MessageModel.findOne({ senderType: "bot" })).toMatchObject({
        deliveryStatus: "failed",
        metadata: { handoff: false }
      });
      const processing = await BotProcessingModel.findById(command.processingId);
      expect(processing).toMatchObject({ status: "failed", errorCode: expect.any(String) });
      expect(JSON.stringify(processing)).not.toContain("secret");
      expect(await ConversationModel.findById(command.conversationId)).toMatchObject({
        status: "open",
        botPausedUntil: null
      });
    }
  );

  it("does not send or emit if initial persistence fails, and never retries the claimed message", async () => {
    const { command, service, sendText } = await arrange();
    vi.spyOn(MessageModel, "create").mockRejectedValueOnce(new Error("database write failed"));
    expect(await service.deliver(command)).toEqual({ status: "failed" });
    expect(await service.deliver(command)).toEqual({ status: "skipped" });
    expect(sendText).not.toHaveBeenCalled();
    expect(realtime.emitChatEvent).not.toHaveBeenCalled();
    expect(realtime.emitInboxEventToRecipients).not.toHaveBeenCalled();
  });

  it("does not emit or resend after an acknowledged send whose final persistence fails", async () => {
    const { command, service, sendText } = await arrange();
    vi.spyOn(MessageModel, "findOneAndUpdate").mockImplementationOnce(() => {
      throw new Error("final write failed");
    });
    expect(await service.deliver(command)).toEqual({ status: "failed" });
    expect(await service.deliver(command)).toEqual({ status: "skipped" });
    expect(sendText).toHaveBeenCalledOnce();
    expect(realtime.emitChatEvent).not.toHaveBeenCalled();
    expect(realtime.emitInboxEventToRecipients).not.toHaveBeenCalled();
    expect(await BotProcessingModel.findById(command.processingId)).toMatchObject({
      status: "failed",
      errorCode: "PERSISTENCE_FAILED"
    });
  });

  it("keeps successful delivery terminal when realtime emission throws", async () => {
    const { command, service, sendText } = await arrange();
    realtime.emitChatEvent.mockImplementationOnce(() => {
      throw new Error("socket unavailable");
    });
    expect(await service.deliver(command)).toEqual({ status: "sent" });
    expect(await service.deliver(command)).toEqual({ status: "skipped" });
    expect(sendText).toHaveBeenCalledOnce();
    expect(await BotProcessingModel.findById(command.processingId)).toMatchObject({
      status: "sent"
    });
  });
});
