import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AssistantModel } from "../../models/assistant.model.js";
import { AutomationTemplateModel } from "../../models/automation-template.model.js";
import { BotProcessingModel } from "../../models/bot-processing.model.js";
import { ConversationModel } from "../../models/conversation.model.js";
import { CustomerModel } from "../../models/customer.model.js";
import { MessageModel } from "../../models/message.model.js";
import { TelegramPersonalSessionModel } from "./telegram-personal.model.js";
import { startTestDatabase, stopTestDatabase } from "../../test/mongo-repl-set.js";
import { ChatbotOrchestrator } from "../../chatbot/chatbot-orchestrator.js";
import * as realtime from "../../realtime/socket.js";
import { resolveTelegramBotAdapter } from "../../chatbot/telegram-chatbot.js";

import {
  buildTelegramQrUrl,
  isQrExpired,
  serializePersonalSession,
  toAvatarDataUrl,
  personalMessageSenderType,
  isPersonalOutgoingMessage,
  getActivePersonalClient
} from "../../services/telegram-personal.service.js";

process.env.ENCRYPTION_KEY ??= "task6-test-encryption-key-32-characters";

interface PersonalTestEvent {
  message: {
    id: number;
    chatId: string;
    senderId: string;
    message: string;
    date: number;
    out: boolean;
    photo?: object;
    document?: { id: string };
    sticker?: { id: string };
    audio?: { id: string };
    voice?: { id: string };
    video?: { id: string };
    videoNote?: { id: string };
    gif?: { id: string };
    file?: { id: string; mimeType?: string; name?: string };
    getSender: () => Promise<{ id: string; firstName: string; bot?: boolean }>;
    getChat: () => Promise<object>;
  };
}

const telegram = vi.hoisted(() => ({
  listener: undefined as undefined | ((event: PersonalTestEvent) => Promise<void>),
  sendMessage: vi.fn(),
  authorized: true
}));

vi.mock("telegram", () => ({
  TelegramClient: class {
    async connect() {}
    async checkAuthorization() { return telegram.authorized; }
    async disconnect() {}
    async downloadProfilePhoto() { return undefined; }
    addEventHandler(listener: (event: PersonalTestEvent) => Promise<void>) { telegram.listener = listener; }
    sendMessage = telegram.sendMessage;
  }
}));
vi.mock("telegram/sessions/index.js", () => ({ StringSession: class {} }));
vi.mock("telegram/events/index.js", () => ({ NewMessage: class {} }));

describe("Telegram personal QR login", () => {
  it("builds a tg login URL from the binary login token", () => {
    const token = new Uint8Array([1, 2, 255]);

    expect(buildTelegramQrUrl(token)).toBe("tg://login?token=AQL_");
  });

  it("marks a QR token expired at its expiry timestamp", () => {
    expect(isQrExpired(new Date("2026-09-09T00:00:30.000Z"), new Date("2026-09-09T00:00:30.000Z"))).toBe(true);
    expect(isQrExpired(new Date("2026-09-09T00:00:30.000Z"), new Date("2026-09-09T00:00:29.999Z"))).toBe(false);
  });

  it("encrypts a session payload before it is persisted", () => {
    const record = serializePersonalSession("session-secret-value");

    expect(record).not.toContain("session-secret-value");
    expect(record.split(".")).toHaveLength(4);
  });

  it("serializes a downloaded avatar into a reusable common avatar URL", () => {
    expect(toAvatarDataUrl(Buffer.from("avatar-bytes"), "image/jpeg")).toBe(
      "data:image/jpeg;base64,YXZhdGFyLWJ5dGVz"
    );
    expect(toAvatarDataUrl(undefined, "image/jpeg")).toBeUndefined();
  });

  it("classifies Telegram messages sent by the connected account as agent messages", () => {
    expect(personalMessageSenderType(true)).toBe("agent");
    expect(personalMessageSenderType(false)).toBe("customer");
  });

  it("recognizes an outgoing message when Telegram identifies the sender as the connected account", () => {
    expect(isPersonalOutgoingMessage({ out: false, senderId: "self-123" }, "self-123")).toBe(true);
  });
});

describe("Telegram personal inbound chatbot integration", () => {
  beforeAll(async () => {
    await startTestDatabase();
    await Promise.all([CustomerModel.syncIndexes(), ConversationModel.syncIndexes(), MessageModel.syncIndexes(), BotProcessingModel.syncIndexes()]);
  }, 120_000);
  beforeEach(async () => {
    vi.restoreAllMocks();
    telegram.listener = undefined;
    telegram.authorized = true;
    telegram.sendMessage.mockReset().mockImplementation(async () => {
      expect(await MessageModel.countDocuments({ senderType: "customer" })).toBe(1);
      return { id: 200 };
    });
    process.env.TELEGRAM_API_ID = "12345";
    process.env.TELEGRAM_API_HASH = "test-api-hash";
    await Promise.all([AssistantModel, AutomationTemplateModel, BotProcessingModel, ConversationModel, CustomerModel, MessageModel, TelegramPersonalSessionModel].map((model) => model.deleteMany({})));
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await stopTestDatabase();
  });

  // Khôi phục client qua session đã mã hóa để kiểm tra đúng listener đang chạy trong ứng dụng.
  async function connect() {
    const ownerId = String(new mongoose.Types.ObjectId());
    await TelegramPersonalSessionModel.create({ userId: ownerId, encryptedSession: serializePersonalSession("test-personal-session"), telegramUserId: "self", displayName: "Chủ cửa hàng", status: "active", connectedAt: new Date() });
    const assistant = await AssistantModel.create({ ownerId, name: "Trợ lý", instructions: "Dùng kiến thức của chủ cửa hàng", channelScope: { mode: "channels", identifiers: ["telegram_personal:456"] } });
    await AutomationTemplateModel.create({ ownerId, assistantId: assistant._id, name: "Chào", keywords: ["xin chào"], responseTemplate: "Chào từ tài khoản cá nhân", channelScope: { mode: "channels", identifiers: ["telegram_personal:456"] } });
    await getActivePersonalClient(ownerId);
    const event: PersonalTestEvent = { message: { id: 99, chatId: "456", senderId: "123", message: " Xin chào ", date: 1_725_801_200, out: false, getSender: async () => ({ id: "123", firstName: "Khách" }), getChat: async () => ({}) } };
    return { ownerId, event };
  }

  it("persists inbound then invokes shared orchestration with the session owner and sends once on replay", async () => {
    const { ownerId, event } = await connect();
    const process = vi.spyOn(ChatbotOrchestrator.prototype, "process");
    await telegram.listener!(event);
    await telegram.listener!(event);
    const customer = await MessageModel.findOne({ senderType: "customer" }).lean();
    expect(customer).toMatchObject({ content: "Xin chào", deliveryStatus: "delivered" });
    expect(await MessageModel.countDocuments()).toBe(2);
    expect(await MessageModel.findOne({ senderType: "bot" }).lean()).toMatchObject({ content: "Chào từ tài khoản cá nhân", externalMessageId: "200", deliveryStatus: "sent" });
    expect(await ConversationModel.findOne().lean()).toMatchObject({ ownerId: new mongoose.Types.ObjectId(ownerId), unreadCount: 1 });
    expect(await BotProcessingModel.findOne().lean()).toMatchObject({ status: "sent" });
    expect(process).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ ownerId, platform: "telegram_personal", channelId: "456", customerMessageId: String(customer!._id), conversationId: String(customer!.conversationId), senderType: "customer", content: "Xin chào", type: "text" }));
    expect(telegram.sendMessage).toHaveBeenCalledExactlyOnceWith("456", { message: "Chào từ tài khoản cá nhân" });
  });

  it("retains the customer message and records a failed handoff when the personal send fails", async () => {
    const { event } = await connect();
    telegram.sendMessage.mockRejectedValue(new Error("private session failure"));
    await telegram.listener!(event);
    await telegram.listener!(event);
    expect(await MessageModel.countDocuments({ senderType: "customer", deliveryStatus: "delivered" })).toBe(1);
    expect(await MessageModel.findOne({ senderType: "bot" }).lean()).toMatchObject({ deliveryStatus: "failed", metadata: { handoff: true, errorCode: "DELIVERY_FAILED" } });
    expect(await ConversationModel.findOne().lean()).toMatchObject({ status: "open", botPausedUntil: null, unreadCount: 1 });
    expect(await BotProcessingModel.findOne().lean()).toMatchObject({ status: "failed" });
    expect(telegram.sendMessage).toHaveBeenCalledOnce();
  });

  it("publishes atomic unread counts for concurrent distinct personal messages", async () => {
    const { ownerId, event } = await connect();
    await AssistantModel.updateMany({}, { enabled: false });
    const customer = await CustomerModel.create({ platform: "telegram_personal", platformId: "123", name: "Khách" });
    await ConversationModel.create({ ownerId, platform: "telegram_personal", channelId: "456", customerId: customer._id });
    const emit = vi.spyOn(realtime, "emitInboxEventToRecipients");
    const create = MessageModel.create.bind(MessageModel);
    let release!: () => void;
    const bothReady = new Promise<void>((resolve) => { release = resolve; });
    let arrivals = 0;
    // Chặn ngay trước ghi tin để cả hai listener đều đã đọc snapshot unread=0.
    vi.spyOn(MessageModel, "create").mockImplementation(async (...args: Parameters<typeof create>) => {
      if (++arrivals === 2) release();
      await bothReady;
      return create(...args);
    });
    await Promise.all([telegram.listener!(event), telegram.listener!({ message: { ...event.message, id: 101 } })]);
    expect(await ConversationModel.findOne().lean()).toMatchObject({ unreadCount: 2 });
    expect(emit.mock.calls.map(([, , payload]) => (payload as { unreadCount: number }).unreadCount).sort()).toEqual([1, 2]);
  });

  it("suppresses a late successful echo after the personal send timed out without retrying", async () => {
    const { ownerId, event } = await connect();
    let finish!: (message: { id: number }) => void;
    telegram.sendMessage.mockImplementation(() => new Promise<{ id: number }>((resolve) => { finish = resolve; }));
    const adapter = await resolveTelegramBotAdapter({ ownerId, platform: "telegram_personal", channelId: "456" });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const sending = adapter!.sendText({ channelId: "456", content: "Chào từ tài khoản cá nhân" });
      const rejected = expect(sending).rejects.toThrow("BOT_TIMEOUT");
      await vi.advanceTimersByTimeAsync(10_000);
      await rejected;
      await vi.advanceTimersByTimeAsync(11_000);
      finish({ id: 200 });
      await vi.advanceTimersByTimeAsync(0);
    } finally {
      vi.useRealTimers();
    }
    const customer = await CustomerModel.create({ platform: "telegram_personal", platformId: "123", name: "Khách" });
    await ConversationModel.create({ ownerId, platform: "telegram_personal", channelId: "456", customerId: customer._id });
    await telegram.listener!({ message: { ...event.message, id: 200, out: true, senderId: "self", message: "Chào từ tài khoản cá nhân" } });
    expect(await MessageModel.countDocuments({ senderType: "agent" })).toBe(0);
    expect(telegram.sendMessage).toHaveBeenCalledOnce();
  });

  it.each(["rejection", "failed"])("records sanitized personal diagnostics and handoff before claim on %s, retained on replay", async (kind) => {
    const { event } = await connect();
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    if (kind === "rejection") vi.spyOn(ChatbotOrchestrator.prototype, "process").mockRejectedValue(new Error("private-token-and-prompt"));
    else vi.spyOn(AssistantModel, "findOne").mockImplementationOnce(() => { throw new Error("private-token-and-prompt"); });
    await telegram.listener!(event);
    const first = await MessageModel.findOne({ senderType: "customer" }).lean();
    expect(first).toMatchObject({ metadata: { botFailure: { code: "PROCESSING_FAILED" } } });
    expect(await ConversationModel.findOne().lean()).toMatchObject({ status: "open", botPausedUntil: null });
    expect(await BotProcessingModel.countDocuments()).toBe(0);
    await telegram.listener!(event);
    expect((await MessageModel.findOne({ senderType: "customer" }).lean())?.metadata.botFailure).toEqual(first!.metadata.botFailure);
    expect(log).toHaveBeenCalledOnce();
    expect(JSON.stringify(log.mock.calls)).toContain("PROCESSING_FAILED");
    expect(JSON.stringify(log.mock.calls)).not.toContain("private-token-and-prompt");
    expect(telegram.sendMessage).not.toHaveBeenCalled();
  });

  it("does not create an agent copy when a bot echo arrives before sendMessage resolves", async () => {
    const { event } = await connect();
    let echo: Promise<void> | undefined;
    telegram.sendMessage.mockImplementation(async () => {
      echo = telegram.listener!({ message: { ...event.message, id: 200, out: true, senderId: "self", message: "Chào từ tài khoản cá nhân" } });
      await new Promise((resolve) => setTimeout(resolve, 100));
      return { id: 200 };
    });
    await telegram.listener!(event);
    await echo;
    expect(await MessageModel.countDocuments()).toBe(2);
    expect(await MessageModel.findOne({ senderType: "bot" }).lean()).toMatchObject({ externalMessageId: "200", deliveryStatus: "sent" });
    expect(await BotProcessingModel.findOne().lean()).toMatchObject({ status: "sent" });
  });

  it("ignores messages from bots before persisting or orchestrating", async () => {
    const { event } = await connect();
    event.message.getSender = async () => ({ id: "bot", firstName: "Bot", bot: true });
    await telegram.listener!(event);
    expect(await MessageModel.countDocuments()).toBe(0);
    expect(await ConversationModel.countDocuments()).toBe(0);
    expect(telegram.sendMessage).not.toHaveBeenCalled();
  });

  it("ignores delivered bot echoes and preserves agent messages without triggering another reply", async () => {
    const { event } = await connect();
    await telegram.listener!(event);
    const process = vi.spyOn(ChatbotOrchestrator.prototype, "process");
    event.message.out = true;
    event.message.senderId = "self";
    event.message.id = 200;
    event.message.message = "Chào từ tài khoản cá nhân";
    await telegram.listener!(event);
    expect((await ConversationModel.findOne().lean())?.botPausedUntil).toBeNull();
    event.message.id = 201;
    event.message.message = "Nhân viên tiếp nhận";
    await telegram.listener!(event);
    expect(await MessageModel.countDocuments({ senderType: "bot" })).toBe(1);
    expect(await MessageModel.findOne({ senderType: "agent" }).lean()).toMatchObject({ content: "Nhân viên tiếp nhận" });
    expect(process).not.toHaveBeenCalled();
    expect(telegram.sendMessage).toHaveBeenCalledOnce();
    expect(await ConversationModel.findOne().lean()).toMatchObject({ botPausedUntil: expect.any(Date) });
    await telegram.listener!({ message: { ...event.message, id: 202, out: false, senderId: "123", message: "Xin chào" } });
    expect(telegram.sendMessage).toHaveBeenCalledOnce();
  });

  it.each(["document", "sticker", "audio", "voice", "video", "videoNote", "gif", "file"] as const)("persists personal %s with/without caption and requests text when absent", async (kind) => {
    const { event } = await connect();
    let nextId = 500;
    telegram.sendMessage.mockImplementation(async () => ({ id: nextId++ }));
    for (const hasCaption of [true, false]) {
      const id = hasCaption ? 99 : 101;
      const incoming = { message: { ...event.message, id, message: hasCaption ? "Xin chào" : "", [kind]: { id: "media-1" } } };
      await telegram.listener!(incoming);
      const type = ["video", "videoNote", "gif"].includes(kind) ? "video" : ["audio", "voice"].includes(kind) ? "audio" : kind === "sticker" ? "image" : "file";
      expect(await MessageModel.findOne({ externalMessageId: String(id) }).lean()).toMatchObject({ type, content: hasCaption ? "Xin chào" : "", metadata: { fileId: "media-1" } });
    }
    expect(await MessageModel.find({ senderType: "bot" }).sort({ createdAt: 1 }).lean()).toEqual([expect.objectContaining({ content: "Chào từ tài khoản cá nhân" }), expect.objectContaining({ content: expect.stringMatching(/văn bản/) })]);
    expect(telegram.sendMessage).toHaveBeenCalledTimes(2);
  });

  it.each([true, false])("preserves personal photo and caption=%s for orchestration", async (hasCaption) => {
    const { event } = await connect();
    event.message.photo = { id: "photo-1" };
    event.message.message = hasCaption ? "Xin chào" : "";
    await telegram.listener!(event);
    expect(await MessageModel.findOne({ senderType: "customer" }).lean()).toMatchObject({ type: "image", content: hasCaption ? "Xin chào" : "" });
    expect(await MessageModel.findOne({ senderType: "bot" }).lean()).toMatchObject({ deliveryStatus: "sent", content: hasCaption ? "Chào từ tài khoản cá nhân" : expect.stringMatching(/văn bản/) });
  });

  it("does not use another owner's assistant", async () => {
    const { event } = await connect();
    await AssistantModel.updateMany({}, { ownerId: new mongoose.Types.ObjectId() });
    await telegram.listener!(event);
    expect(await MessageModel.countDocuments({ senderType: "customer" })).toBe(1);
    expect(await BotProcessingModel.countDocuments()).toBe(0);
    expect(telegram.sendMessage).not.toHaveBeenCalled();
  });

  it("does not ingest updates after the owning session becomes inactive", async () => {
    const { ownerId, event } = await connect();
    await TelegramPersonalSessionModel.updateOne({ userId: ownerId }, { status: "disconnected" });
    await telegram.listener!(event);
    expect(await MessageModel.countDocuments()).toBe(0);
    expect(telegram.sendMessage).not.toHaveBeenCalled();
  });

  it("keeps the persisted inbound on unexpected orchestration rejection without replaying", async () => {
    const { event } = await connect();
    const process = vi.spyOn(ChatbotOrchestrator.prototype, "process").mockRejectedValue(new Error("processing unavailable"));
    await expect(telegram.listener!(event)).resolves.toBeUndefined();
    await expect(telegram.listener!(event)).resolves.toBeUndefined();
    expect(await MessageModel.countDocuments({ senderType: "customer" })).toBe(1);
    expect(process).toHaveBeenCalledOnce();
  });
});
