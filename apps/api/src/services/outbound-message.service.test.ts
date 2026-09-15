import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "../common/errors.js";

const dependencyMocks = vi.hoisted(() => ({
  botClientConstructedWith: vi.fn(),
  botSendText: vi.fn(),
  createMessage: vi.fn(),
  findConversationById: vi.fn(),
  pauseConversation: vi.fn(),
  acquireSendLease: vi.fn(),
  releaseSendLease: vi.fn(),
  getActivePersonalClient: vi.fn(),
  personalSendMessage: vi.fn(),
  getActiveZaloPersonalClient: vi.fn(),
  zaloPersonalSendMessage: vi.fn(),
  readProviderSecretByName: vi.fn()
}));

vi.mock("../models/conversation.model.js", () => ({
  ConversationModel: { findById: dependencyMocks.findConversationById, findByIdAndUpdate: dependencyMocks.pauseConversation, findOneAndUpdate: dependencyMocks.acquireSendLease, updateOne: dependencyMocks.releaseSendLease }
}));

vi.mock("../models/message.model.js", () => ({
  MessageModel: { create: dependencyMocks.createMessage }
}));

vi.mock("./telegram-personal.service.js", () => ({
  getActivePersonalClient: dependencyMocks.getActivePersonalClient
}));

vi.mock("./zalo-personal.service.js", () => ({
  getActiveZaloPersonalClient: dependencyMocks.getActiveZaloPersonalClient
}));

vi.mock("../channels/telegram/telegram.client.js", () => ({
  TelegramClient: class {
    constructor(botToken: string) {
      dependencyMocks.botClientConstructedWith(botToken);
    }

    sendText(channelId: string, content: string) {
      return dependencyMocks.botSendText(channelId, content);
    }
  }
}));

vi.mock("./provider-secret.service.js", () => ({
  readProviderSecretByName: dependencyMocks.readProviderSecretByName
}));

import { sendOutboundMessage } from "./message.service.js";

const now = new Date("2026-09-10T04:30:00.000Z");
const agentAuth = { id: "agent-1", email: "agent@example.com", role: "agent" } as const;

function conversation(overrides: Record<string, unknown> = {}) {
  return {
    _id: "conversation-1",
    customerId: {
      _id: "customer-1",
      name: "Customer One",
      avatarUrl: "https://cdn.example/customer-1.png"
    },
    platform: "telegram",
    channelId: "chat-42",
    ownerId: "customer-1",
    assignedAgentId: "agent-1",
    unreadCount: 2,
    status: "open",
    lastMessageAt: "2026-09-10T04:00:00.000Z",
    lastMessageSnippet: "Earlier",
    conversationName: null,
    conversationType: "private",
    ...overrides
  };
}

function arrangeConversation(row: ReturnType<typeof conversation> | null) {
  dependencyMocks.findConversationById.mockReturnValue({
    populate: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue(row)
    })
  });
}

function arrangeStoredMessage() {
  dependencyMocks.createMessage.mockImplementation(async (input) => ({
    toObject: () => ({
      ...input,
      _id: "message-1",
      createdAt: "2026-09-10T04:30:01.000Z"
    })
  }));
}

describe("sendOutboundMessage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    dependencyMocks.acquireSendLease.mockReturnValue({ lean: async () => ({ _id: "conversation-1" }) });
    dependencyMocks.releaseSendLease.mockResolvedValue({ matchedCount: 1 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("pauses the bot before an authorized agent calls the connector", async () => {
    arrangeConversation(conversation());
    arrangeStoredMessage();
    dependencyMocks.readProviderSecretByName.mockResolvedValue("test-token");
    dependencyMocks.botSendText.mockImplementation(async () => {
      expect(dependencyMocks.pauseConversation).toHaveBeenCalledWith("conversation-1", {
        $max: { botPausedUntil: new Date("2026-09-10T05:00:00.000Z") }
      });
      return { externalMessageId: "123" };
    });
    await sendOutboundMessage({ conversationId: "conversation-1", content: "Hello" }, agentAuth);
    expect(dependencyMocks.botSendText).toHaveBeenCalledOnce();
  });

  it("delivers through the Telegram bot and persists the external message id", async () => {
    arrangeConversation(conversation());
    dependencyMocks.readProviderSecretByName.mockResolvedValue("123456:bot-token");
    dependencyMocks.botSendText.mockResolvedValue({ externalMessageId: "9001", status: "sent" });
    arrangeStoredMessage();

    const result = await sendOutboundMessage(
      { conversationId: "conversation-1", content: "Hello from support" },
      agentAuth
    );

    expect(dependencyMocks.readProviderSecretByName).toHaveBeenCalledWith("telegram", "bot-token");
    expect(dependencyMocks.botClientConstructedWith).toHaveBeenCalledWith("123456:bot-token");
    expect(dependencyMocks.botSendText).toHaveBeenCalledWith("chat-42", "Hello from support");
    expect(dependencyMocks.botSendText).toHaveBeenCalledTimes(1);
    expect(dependencyMocks.getActivePersonalClient).not.toHaveBeenCalled();
    expect(dependencyMocks.createMessage).toHaveBeenCalledWith({
      conversationId: "conversation-1",
      platform: "telegram",
      senderId: "agent",
      content: "Hello from support",
      externalMessageId: "9001",
      deliveryStatus: "sent",
      senderType: "agent",
      type: "text"
    });
    expect(dependencyMocks.pauseConversation).toHaveBeenCalledWith("conversation-1", {
      $set: { lastMessageAt: now, lastMessageSnippet: "Hello from support" }
    });
    expect(result).toEqual({
      message: {
        id: "message-1",
        conversationId: "conversation-1",
        platform: "telegram",
        senderType: "agent",
        senderId: "agent",
        type: "text",
        content: "Hello from support",
        deliveryStatus: "sent",
        createdAt: "2026-09-10T04:30:01.000Z"
      },
      conversation: {
        id: "conversation-1",
        customerId: "customer-1",
        platform: "telegram",
        channelId: "chat-42",
        assignedAgentId: "agent-1",
        unreadCount: 2,
        status: "open",
        lastMessageAt: "2026-09-10T04:30:00.000Z",
        lastMessageSnippet: "Hello from support",
        customerName: "Customer One",
        customerAvatarUrl: "https://cdn.example/customer-1.png",
        conversationName: null,
        conversationType: "private"
      },
      recipients: ["customer-1", "agent-1"]
    });
  });

  it("delivers through the owner's Telegram personal session and persists its message id", async () => {
    arrangeConversation(conversation({
      platform: "telegram_personal",
      assignedAgentId: null
    }));
    const personalClient = {
      getEntity: vi.fn().mockResolvedValue("peer-42"),
      sendMessage: dependencyMocks.personalSendMessage
    };
    dependencyMocks.getActivePersonalClient.mockResolvedValue(personalClient);
    dependencyMocks.personalSendMessage.mockResolvedValue({ id: 8123 });
    arrangeStoredMessage();
    const ownerAuth = { id: "customer-1", email: "owner@example.com", role: "customer" } as const;

    const result = await sendOutboundMessage(
      { conversationId: "conversation-1", content: "Hello from support" },
      ownerAuth
    );

    expect(dependencyMocks.getActivePersonalClient).toHaveBeenCalledWith("customer-1");
    expect(personalClient.getEntity).toHaveBeenCalledWith("chat-42");
    expect(dependencyMocks.personalSendMessage).toHaveBeenCalledWith("peer-42", {
      message: "Hello from support"
    });
    expect(dependencyMocks.personalSendMessage).toHaveBeenCalledTimes(1);
    expect(dependencyMocks.readProviderSecretByName).not.toHaveBeenCalled();
    expect(dependencyMocks.botSendText).not.toHaveBeenCalled();
    expect(dependencyMocks.createMessage).toHaveBeenCalledWith({
      conversationId: "conversation-1",
      platform: "telegram_personal",
      senderId: "agent",
      content: "Hello from support",
      externalMessageId: "8123",
      deliveryStatus: "sent",
      senderType: "agent",
      type: "text"
    });
    expect(result.message).toEqual({
      id: "message-1",
      conversationId: "conversation-1",
      platform: "telegram_personal",
      senderType: "agent",
      senderId: "agent",
      type: "text",
      content: "Hello from support",
      deliveryStatus: "sent",
      createdAt: "2026-09-10T04:30:01.000Z"
    });
    expect(result.recipients).toEqual(["customer-1", ""]);
  });

  it("sends through Zalo personal after pausing the bot and persists the external id", async () => {
    arrangeConversation(conversation({
      platform: "zalo_personal",
      assignedAgentId: null
    }));
    dependencyMocks.getActiveZaloPersonalClient.mockResolvedValue({
      sendMessage: dependencyMocks.zaloPersonalSendMessage
    });
    dependencyMocks.zaloPersonalSendMessage.mockImplementation(async () => {
      expect(dependencyMocks.pauseConversation).toHaveBeenCalledWith("conversation-1", {
        $max: { botPausedUntil: new Date("2026-09-10T05:00:00.000Z") }
      });
      return { id: "zalo-9001" };
    });
    arrangeStoredMessage();
    const ownerAuth = { id: "customer-1", email: "owner@example.com", role: "customer" } as const;

    const result = await sendOutboundMessage(
      { conversationId: "conversation-1", content: "Hello from Zalo support" },
      ownerAuth
    );

    expect(dependencyMocks.getActiveZaloPersonalClient).toHaveBeenCalledWith("customer-1");
    expect(dependencyMocks.zaloPersonalSendMessage).toHaveBeenCalledWith("chat-42", "Hello from Zalo support");
    expect(dependencyMocks.zaloPersonalSendMessage).toHaveBeenCalledOnce();
    expect(dependencyMocks.getActivePersonalClient).not.toHaveBeenCalled();
    expect(dependencyMocks.botSendText).not.toHaveBeenCalled();
    expect(dependencyMocks.createMessage).toHaveBeenCalledWith({
      conversationId: "conversation-1",
      platform: "zalo_personal",
      senderId: "agent",
      content: "Hello from Zalo support",
      externalMessageId: "zalo-9001",
      deliveryStatus: "sent",
      senderType: "agent",
      type: "text"
    });
    expect(result.message).toMatchObject({
      platform: "zalo_personal",
      content: "Hello from Zalo support",
      deliveryStatus: "sent"
    });
  });

  it("rejects a disconnected Zalo personal session without persisting", async () => {
    arrangeConversation(conversation({
      platform: "zalo_personal",
      assignedAgentId: null
    }));
    dependencyMocks.getActiveZaloPersonalClient.mockResolvedValue(undefined);
    const ownerAuth = { id: "customer-1", email: "owner@example.com", role: "customer" } as const;

    await expect(sendOutboundMessage(
      { conversationId: "conversation-1", content: "Hello from Zalo support" },
      ownerAuth
    )).rejects.toMatchObject({
      statusCode: 409,
      code: "ZALO_PERSONAL_DISCONNECTED",
      message: "Zalo personal session is not active"
    } satisfies Partial<AppError>);

    expect(dependencyMocks.zaloPersonalSendMessage).not.toHaveBeenCalled();
    expect(dependencyMocks.createMessage).not.toHaveBeenCalled();
  });

  it.each([agentAuth, { id: "admin-1", email: "admin@example.com", role: "admin" as const }])(
    "denies a non-owner %j from using a Zalo personal connection", async (auth) => {
      arrangeConversation(conversation({ platform: "zalo_personal" }));

      await expect(sendOutboundMessage(
        { conversationId: "conversation-1", content: "Hello from Zalo support" }, auth
      )).rejects.toMatchObject({
        statusCode: 403,
        code: "FORBIDDEN",
        message: "You do not own this Zalo connection"
      } satisfies Partial<AppError>);

      expect(dependencyMocks.pauseConversation).not.toHaveBeenCalled();
      expect(dependencyMocks.getActiveZaloPersonalClient).not.toHaveBeenCalled();
      expect(dependencyMocks.createMessage).not.toHaveBeenCalled();
    }
  );

  it("hides a Zalo personal connector failure behind a stable error", async () => {
    arrangeConversation(conversation({
      platform: "zalo_personal",
      assignedAgentId: null
    }));
    dependencyMocks.getActiveZaloPersonalClient.mockResolvedValue({
      sendMessage: dependencyMocks.zaloPersonalSendMessage
    });
    dependencyMocks.zaloPersonalSendMessage.mockRejectedValue(new Error("connector credential=secret-cookie failed"));
    const ownerAuth = { id: "customer-1", email: "owner@example.com", role: "customer" } as const;

    await expect(sendOutboundMessage(
      { conversationId: "conversation-1", content: "Hello from Zalo support" },
      ownerAuth
    )).rejects.toMatchObject({
      statusCode: 502,
      code: "ZALO_PERSONAL_DELIVERY_FAILED",
      message: "Zalo personal message delivery failed"
    } satisfies Partial<AppError>);

    expect(dependencyMocks.createMessage).not.toHaveBeenCalled();
  });

  it("persists unsupported-platform delivery as pending without an external id", async () => {
    arrangeConversation(conversation({ platform: "facebook" }));
    arrangeStoredMessage();

    const result = await sendOutboundMessage(
      { conversationId: "conversation-1", content: "Hello from support" },
      agentAuth
    );

    expect(result.message.deliveryStatus).toBe("pending");
    expect(dependencyMocks.botSendText).not.toHaveBeenCalled();
    expect(dependencyMocks.getActivePersonalClient).not.toHaveBeenCalled();
    expect(dependencyMocks.createMessage).toHaveBeenCalledWith({
      conversationId: "conversation-1",
      platform: "facebook",
      senderId: "agent",
      content: "Hello from support",
      externalMessageId: undefined,
      deliveryStatus: "pending",
      senderType: "agent",
      type: "text"
    });
  });

  it("falls back to a matching Telegram dialog when the personal user entity is not cached", async () => {
    arrangeConversation(conversation({ platform: "telegram_personal", assignedAgentId: null }));
    const entityError = new Error("entity is not cached");
    const personalClient = {
      getEntity: vi.fn().mockRejectedValue(entityError),
      getDialogs: vi.fn().mockResolvedValue([{ id: "chat-42", entity: "peer-from-dialog" }]),
      sendMessage: dependencyMocks.personalSendMessage
    };
    dependencyMocks.getActivePersonalClient.mockResolvedValue(personalClient);
    dependencyMocks.personalSendMessage.mockResolvedValue({ id: 8124 });
    arrangeStoredMessage();

    await sendOutboundMessage(
      { conversationId: "conversation-1", content: "Hello from support" },
      { id: "customer-1", email: "owner@example.com", role: "customer" }
    );

    expect(personalClient.getDialogs).toHaveBeenCalledWith({ limit: 100 });
    expect(dependencyMocks.personalSendMessage).toHaveBeenCalledWith("peer-from-dialog", {
      message: "Hello from support"
    });
  });

  it("denies conversation access before delivery or persistence", async () => {
    arrangeConversation(conversation({ assignedAgentId: "agent-2" }));

    await expect(sendOutboundMessage(
      { conversationId: "conversation-1", content: "Hello from support" },
      agentAuth
    )).rejects.toMatchObject({
      statusCode: 403,
      code: "FORBIDDEN",
      message: "You do not have access to this conversation"
    } satisfies Partial<AppError>);

    expect(dependencyMocks.botSendText).not.toHaveBeenCalled();
    expect(dependencyMocks.createMessage).not.toHaveBeenCalled();
  });

  it("reports a missing conversation before delivery or persistence", async () => {
    arrangeConversation(null);

    await expect(sendOutboundMessage(
      { conversationId: "missing", content: "Hello" }, agentAuth
    )).rejects.toMatchObject({ statusCode: 404, code: "CONVERSATION_NOT_FOUND" });

    expect(dependencyMocks.findConversationById).toHaveBeenCalledWith("missing");
    expect(dependencyMocks.readProviderSecretByName).not.toHaveBeenCalled();
    expect(dependencyMocks.getActivePersonalClient).not.toHaveBeenCalled();
    expect(dependencyMocks.createMessage).not.toHaveBeenCalled();
  });

  it.each([
    undefined,
    { id: "other-customer", email: "other@example.com", role: "customer" as const }
  ])("denies unauthenticated or unrelated customer access (%j)", async (auth) => {
    arrangeConversation(conversation());

    await expect(sendOutboundMessage(
      { conversationId: "conversation-1", content: "Hello" }, auth
    )).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });

    expect(dependencyMocks.readProviderSecretByName).not.toHaveBeenCalled();
    expect(dependencyMocks.getActivePersonalClient).not.toHaveBeenCalled();
    expect(dependencyMocks.createMessage).not.toHaveBeenCalled();
  });

  it.each(["bot secret", "bot delivery", "personal delivery"])(
    "propagates %s failures without persistence", async (stage) => {
      arrangeConversation(conversation({
        platform: stage === "personal delivery" ? "telegram_personal" : "telegram",
        ownerId: "agent-1"
      }));
      const failure = new Error(`${stage} failed`);
      dependencyMocks.readProviderSecretByName.mockResolvedValue("test-token");
      dependencyMocks.getActivePersonalClient.mockResolvedValue({
        getEntity: vi.fn().mockResolvedValue("chat-42"),
        sendMessage: dependencyMocks.personalSendMessage
      });
      const failingDependency = stage === "bot secret"
        ? dependencyMocks.readProviderSecretByName
        : stage === "bot delivery" ? dependencyMocks.botSendText : dependencyMocks.personalSendMessage;
      failingDependency.mockRejectedValue(failure);

      await expect(sendOutboundMessage(
        { conversationId: "conversation-1", content: "Hello" }, agentAuth
      )).rejects.toBe(failure);

      expect(dependencyMocks.createMessage).not.toHaveBeenCalled();
    }
  );

  it("propagates persistence failure after delivery", async () => {
    arrangeConversation(conversation());
    dependencyMocks.readProviderSecretByName.mockResolvedValue("test-token");
    dependencyMocks.botSendText.mockResolvedValue({ externalMessageId: "9001" });
    const failure = new Error("database unavailable");
    dependencyMocks.createMessage.mockRejectedValue(failure);

    await expect(sendOutboundMessage(
      { conversationId: "conversation-1", content: "Hello" }, agentAuth
    )).rejects.toBe(failure);
    expect(dependencyMocks.createMessage).toHaveBeenCalledWith(expect.objectContaining({
      externalMessageId: "9001", deliveryStatus: "sent"
    }));
  });

  it("allows an admin to send to an unassigned conversation", async () => {
    arrangeConversation(conversation({ platform: "facebook", ownerId: null, assignedAgentId: null }));
    arrangeStoredMessage();

    const result = await sendOutboundMessage(
      { conversationId: "conversation-1", content: "Admin reply" },
      { id: "admin-1", email: "admin@example.com", role: "admin" }
    );

    expect(result.message.content).toBe("Admin reply");
    expect(result.recipients).toEqual(["", ""]);
    expect(dependencyMocks.createMessage).toHaveBeenCalledTimes(1);
  });

  it.each([agentAuth, { id: "admin-1", email: "admin@example.com", role: "admin" as const }])(
    "denies a non-owner %j from using a Telegram personal connection", async (auth) => {
    arrangeConversation(conversation({ platform: "telegram_personal" }));

    await expect(sendOutboundMessage(
      { conversationId: "conversation-1", content: "Hello from support" },
      auth
    )).rejects.toMatchObject({
      statusCode: 403,
      code: "FORBIDDEN",
      message: "You do not own this Telegram connection"
    } satisfies Partial<AppError>);

    expect(dependencyMocks.pauseConversation).not.toHaveBeenCalled();
    expect(dependencyMocks.getActivePersonalClient).not.toHaveBeenCalled();
    expect(dependencyMocks.createMessage).not.toHaveBeenCalled();
  });

  it("rejects a disconnected Telegram personal session without persisting", async () => {
    arrangeConversation(conversation({
      platform: "telegram_personal",
      assignedAgentId: null
    }));
    dependencyMocks.getActivePersonalClient.mockResolvedValue(undefined);
    const ownerAuth = { id: "customer-1", email: "owner@example.com", role: "customer" } as const;

    await expect(sendOutboundMessage(
      { conversationId: "conversation-1", content: "Hello from support" },
      ownerAuth
    )).rejects.toMatchObject({
      statusCode: 409,
      code: "TELEGRAM_PERSONAL_DISCONNECTED",
      message: "Telegram personal session is not active"
    } satisfies Partial<AppError>);

    expect(dependencyMocks.personalSendMessage).not.toHaveBeenCalled();
    expect(dependencyMocks.createMessage).not.toHaveBeenCalled();
  });
});
