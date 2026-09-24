import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "../common/errors.js";
import type { WorkspaceChannelRef } from "@nhuu-chat/contracts";

const dependencyMocks = vi.hoisted(() => ({
  botClientConstructedWith: vi.fn(),
  botSendText: vi.fn(),
  createMessage: vi.fn(),
  findMessage: vi.fn(),
  findConversationById: vi.fn(),
  findPageConnection: vi.fn(),
  findInstagramConnection: vi.fn(),
  pauseConversation: vi.fn(),
  acquireSendLease: vi.fn(),
  releaseSendLease: vi.fn(),
  getActivePersonalClient: vi.fn(),
  personalSendMessage: vi.fn(),
  getActiveZaloPersonalClient: vi.fn(),
  zaloPersonalSendMessage: vi.fn(),
  personalSendFile: vi.fn(),
  uploadFile: vi.fn(),
  readProviderSecretByName: vi.fn(),
  decryptSecret: vi.fn(),
  facebookSendText: vi.fn(),
  instagramSendText: vi.fn()
}));

vi.mock("../models/conversation.model.js", () => ({
  ConversationModel: { findById: dependencyMocks.findConversationById, findByIdAndUpdate: dependencyMocks.pauseConversation, findOneAndUpdate: dependencyMocks.acquireSendLease, updateOne: dependencyMocks.releaseSendLease }
}));

vi.mock("../models/message.model.js", () => ({
  MessageModel: { create: dependencyMocks.createMessage, findOne: dependencyMocks.findMessage }
}));

vi.mock("../models/facebook-page-connection.model.js", () => ({
  FacebookPageConnectionModel: { findOne: dependencyMocks.findPageConnection }
}));

vi.mock("../models/instagram-account-connection.model.js", () => ({
  InstagramAccountConnectionModel: { findOne: dependencyMocks.findInstagramConnection }
}));

vi.mock("../common/crypto.js", () => ({ decryptSecret: dependencyMocks.decryptSecret }));

vi.mock("../channels/facebook-messenger/facebook-messenger.client.js", () => ({
  facebookMessengerClient: { sendText: dependencyMocks.facebookSendText }
}));

vi.mock("../channels/instagram/instagram.client.js", () => ({
  instagramClient: { sendText: dependencyMocks.instagramSendText }
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

vi.mock("../media/cloudinary.service.js", () => ({
  CloudinaryMediaService: class {
    uploadFile(input: unknown) {
      return dependencyMocks.uploadFile(input);
    }
  }
}));

import { sendOutboundMessage } from "./message.service.js";

const now = new Date("2026-09-10T04:30:00.000Z");
const agentAuth = {
  id: "agent-1", email: "agent@example.com", role: "agent",
  workspace: { ownerUserId: "customer-1", allowedPages: [] }
} as const;

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
    dependencyMocks.findPageConnection.mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({
        userId: "customer-1", pageId: "page-1", encryptedPageAccessToken: "ciphertext", status: "connected"
      }) })
    });
    dependencyMocks.findInstagramConnection.mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ ownerUserId: "customer-1", instagramUserId: "ig-1", encryptedAccessToken: "ig-cipher", tokenExpiresAt: null, status: "connected" }) })
    });
    dependencyMocks.decryptSecret.mockReturnValue("page-access-token-secret");
    dependencyMocks.findMessage.mockReturnValue({
      sort: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) })
      })
    });
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
        botEnabled: true,
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

  it("delivers an assigned Workspace reply through the owner's Telegram personal session", async () => {
    arrangeConversation(conversation({ platform: "telegram_personal", assignedAgentId: null }));
    const personalClient = { getEntity: vi.fn().mockResolvedValue("peer-42"), sendMessage: dependencyMocks.personalSendMessage };
    dependencyMocks.getActivePersonalClient.mockResolvedValue(personalClient);
    dependencyMocks.personalSendMessage.mockResolvedValue({ id: 8124 });
    arrangeStoredMessage();

    await sendOutboundMessage({ conversationId: "conversation-1", content: "Workspace reply" }, {
      id: "staff-1", email: "staff@example.com", role: "customer",
      workspace: { ownerUserId: "customer-1", allowedChannels: [{ platform: "telegram_personal", channelId: "customer-1" }] }
    });

    expect(dependencyMocks.getActivePersonalClient).toHaveBeenCalledWith("customer-1");
    expect(dependencyMocks.personalSendMessage).toHaveBeenCalledWith("peer-42", { message: "Workspace reply" });
  });

  it("sends a Telegram personal attachment with a caption and persists its URL", async () => {
    arrangeConversation(conversation({ platform: "telegram_personal", assignedAgentId: null }));
    const personalClient = {
      getEntity: vi.fn().mockResolvedValue("peer-42"),
      sendMessage: dependencyMocks.personalSendMessage,
      sendFile: dependencyMocks.personalSendFile
    };
    dependencyMocks.getActivePersonalClient.mockResolvedValue(personalClient);
    dependencyMocks.personalSendFile.mockResolvedValue({ id: 8125 });
    dependencyMocks.uploadFile.mockResolvedValue({
      secureUrl: "https://res.cloudinary.com/example/raw/upload/bang-gia.pdf",
      publicId: "message-asset-1",
      resourceType: "raw",
      mimeType: "application/pdf",
      bytes: 3
    });
    arrangeStoredMessage();

    const result = await sendOutboundMessage({
      conversationId: "conversation-1",
      content: "Bảng giá",
      attachment: { buffer: Buffer.from("pdf"), originalname: "bang-gia.pdf", mimetype: "application/pdf", size: 3 }
    }, { id: "customer-1", email: "owner@example.com", role: "customer" });

    expect(dependencyMocks.personalSendFile).toHaveBeenCalledWith("peer-42", expect.objectContaining({ caption: "Bảng giá" }));
    expect(dependencyMocks.personalSendMessage).not.toHaveBeenCalled();
    expect(dependencyMocks.createMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: "file",
      attachments: [{ url: "https://res.cloudinary.com/example/raw/upload/bang-gia.pdf", fileType: "application/pdf", fileName: "bang-gia.pdf" }]
    }));
    expect(result.message).toMatchObject({ type: "file", attachments: [{ url: "https://res.cloudinary.com/example/raw/upload/bang-gia.pdf", fileName: "bang-gia.pdf", mimeType: "application/pdf" }] });
  });

  it("does not deliver an attachment through an unsupported channel", async () => {
    arrangeConversation(conversation({ platform: "telegram" }));

    await expect(sendOutboundMessage({
      conversationId: "conversation-1",
      content: "Tài liệu",
      attachment: { buffer: Buffer.from("pdf"), originalname: "tai-lieu.pdf", mimetype: "application/pdf", size: 3 }
    }, agentAuth)).rejects.toMatchObject({ code: "UNSUPPORTED_ATTACHMENT_CHANNEL", statusCode: 400 });

    expect(dependencyMocks.uploadFile).not.toHaveBeenCalled();
    expect(dependencyMocks.botSendText).not.toHaveBeenCalled();
  });

  it("sends through Zalo personal after pausing the bot and persists the external id", async () => {
    arrangeConversation(conversation({
      platform: "zalo_personal",
      assignedAgentId: null,
      zaloAccountId: "zalo-account-1"
    }));
    dependencyMocks.getActiveZaloPersonalClient.mockResolvedValue({
      getAccountInfo: vi.fn().mockResolvedValue({ id: "zalo-account-1" }),
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
    expect(dependencyMocks.zaloPersonalSendMessage).toHaveBeenCalledWith(
      "chat-42",
      "Hello from Zalo support",
      "private"
    );
    expect(dependencyMocks.zaloPersonalSendMessage).toHaveBeenCalledOnce();
    expect(dependencyMocks.getActivePersonalClient).not.toHaveBeenCalled();
    expect(dependencyMocks.botSendText).not.toHaveBeenCalled();
    expect(dependencyMocks.createMessage).toHaveBeenCalledWith({
      conversationId: "conversation-1",
      platform: "zalo_personal",
      senderId: "agent",
      content: "Hello from Zalo support",
      externalMessageId: "zalo_personal:zalo-account-1:zalo-9001",
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

  it("delivers an assigned Workspace reply through the owner's Zalo personal session", async () => {
    arrangeConversation(conversation({ platform: "zalo_personal", assignedAgentId: null, zaloAccountId: "zalo-account-1" }));
    dependencyMocks.getActiveZaloPersonalClient.mockResolvedValue({
      getAccountInfo: vi.fn().mockResolvedValue({ id: "zalo-account-1" }),
      sendMessage: dependencyMocks.zaloPersonalSendMessage
    });
    dependencyMocks.zaloPersonalSendMessage.mockResolvedValue({ id: "zalo-message-1" });
    arrangeStoredMessage();

    await sendOutboundMessage({ conversationId: "conversation-1", content: "Workspace Zalo reply" }, {
      id: "staff-1", email: "staff@example.com", role: "customer",
      workspace: { ownerUserId: "customer-1", allowedChannels: [{ platform: "zalo_personal", channelId: "customer-1" }] }
    });

    expect(dependencyMocks.getActiveZaloPersonalClient).toHaveBeenCalledWith("customer-1");
    expect(dependencyMocks.zaloPersonalSendMessage).toHaveBeenCalledWith("chat-42", "Workspace Zalo reply", "private");
  });

  it("rejects a Zalo conversation owned by a different logged-in account", async () => {
    arrangeConversation(conversation({
      platform: "zalo_personal",
      assignedAgentId: null,
      zaloAccountId: "old-zalo-account"
    }));
    dependencyMocks.getActiveZaloPersonalClient.mockResolvedValue({
      getAccountInfo: vi.fn().mockResolvedValue({ id: "current-zalo-account" }),
      sendMessage: dependencyMocks.zaloPersonalSendMessage
    });
    arrangeStoredMessage();
    const ownerAuth = { id: "customer-1", email: "owner@example.com", role: "customer" } as const;

    await expect(sendOutboundMessage(
      { conversationId: "conversation-1", content: "Hello from Zalo support" },
      ownerAuth
    )).rejects.toMatchObject({
      statusCode: 409,
      code: "ZALO_PERSONAL_CONVERSATION_ACCOUNT_MISMATCH"
    } satisfies Partial<AppError>);

    expect(dependencyMocks.zaloPersonalSendMessage).not.toHaveBeenCalled();
    expect(dependencyMocks.createMessage).toHaveBeenCalledWith(expect.objectContaining({
      deliveryStatus: "failed"
    }));
  });

  it("recovers the account binding for legacy Zalo conversations", async () => {
    arrangeConversation(conversation({ platform: "zalo_personal", assignedAgentId: null }));
    dependencyMocks.findMessage.mockReturnValue({
      sort: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue({ externalMessageId: "zalo_personal:old-zalo-account:8271" })
        })
      })
    });
    dependencyMocks.getActiveZaloPersonalClient.mockResolvedValue({
      getAccountInfo: vi.fn().mockResolvedValue({ id: "current-zalo-account" }),
      sendMessage: dependencyMocks.zaloPersonalSendMessage
    });
    arrangeStoredMessage();

    await expect(sendOutboundMessage(
      { conversationId: "conversation-1", content: "Hello from Zalo support" },
      { id: "customer-1", email: "owner@example.com", role: "customer" }
    )).rejects.toMatchObject({ code: "ZALO_PERSONAL_CONVERSATION_ACCOUNT_MISMATCH" });

    expect(dependencyMocks.zaloPersonalSendMessage).not.toHaveBeenCalled();
  });

  it("remaps a legacy private conversation to the matching contact on the current Zalo account", async () => {
    arrangeConversation(conversation({
      platform: "zalo_personal",
      assignedAgentId: null,
      zaloAccountId: "old-zalo-account",
      customerId: { _id: "customer-1", name: "Quyên Hoàng" }
    }));
    const findCurrentContact = vi.fn().mockResolvedValue("new-zalo-thread");
    dependencyMocks.getActiveZaloPersonalClient.mockResolvedValue({
      getAccountInfo: vi.fn().mockResolvedValue({ id: "current-zalo-account" }),
      findUserIdByName: findCurrentContact,
      sendMessage: dependencyMocks.zaloPersonalSendMessage
    });
    dependencyMocks.zaloPersonalSendMessage.mockResolvedValue({ id: "zalo-9004" });
    arrangeStoredMessage();

    await sendOutboundMessage(
      { conversationId: "conversation-1", content: "Hello from Zalo support" },
      { id: "customer-1", email: "owner@example.com", role: "customer" }
    );

    expect(findCurrentContact).toHaveBeenCalledWith("Quyên Hoàng");
    expect(dependencyMocks.zaloPersonalSendMessage).toHaveBeenCalledWith(
      "new-zalo-thread",
      "Hello from Zalo support",
      "private"
    );
    expect(dependencyMocks.pauseConversation).toHaveBeenCalledWith("conversation-1", {
      $set: { channelId: "new-zalo-thread", zaloAccountId: "current-zalo-account" }
    });
  });

  it("returns the persisted Zalo message when its listener wins the persistence race", async () => {
    arrangeConversation(conversation({
      platform: "zalo_personal",
      assignedAgentId: null,
      zaloAccountId: "zalo-account-1"
    }));
    dependencyMocks.getActiveZaloPersonalClient.mockResolvedValue({
      getAccountInfo: vi.fn().mockResolvedValue({ id: "zalo-account-1" }),
      sendMessage: dependencyMocks.zaloPersonalSendMessage
    });
    dependencyMocks.zaloPersonalSendMessage.mockResolvedValue({ id: "zalo-9003" });
    const duplicate = Object.assign(new Error("duplicate external message"), { code: 11000 });
    dependencyMocks.createMessage.mockRejectedValue(duplicate);
    dependencyMocks.findMessage.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: "message-from-listener",
        conversationId: "conversation-1",
        platform: "zalo_personal",
        senderType: "customer",
        senderId: "customer-1",
        type: "text",
        content: "Hello from Zalo support",
        deliveryStatus: "delivered",
        createdAt: "2026-09-10T04:30:01.000Z"
      })
    });

    const result = await sendOutboundMessage(
      { conversationId: "conversation-1", content: "Hello from Zalo support" },
      { id: "customer-1", email: "owner@example.com", role: "customer" }
    );

    expect(dependencyMocks.findMessage).toHaveBeenCalledWith({
      platform: "zalo_personal",
      externalMessageId: "zalo_personal:zalo-account-1:zalo-9003"
    });
    expect(result.message).toMatchObject({
      id: "message-from-listener",
      platform: "zalo_personal",
      deliveryStatus: "delivered"
    });
    expect(dependencyMocks.pauseConversation).toHaveBeenCalledWith("conversation-1", {
      $set: { lastMessageAt: now, lastMessageSnippet: "Hello from Zalo support" }
    });
  });

  it("passes group conversation type through the Zalo personal outbound boundary", async () => {
    arrangeConversation(conversation({
      platform: "zalo_personal",
      assignedAgentId: null,
      conversationType: "group"
    }));
    dependencyMocks.getActiveZaloPersonalClient.mockResolvedValue({
      getAccountInfo: vi.fn().mockResolvedValue({ id: "zalo-account-1" }),
      sendMessage: dependencyMocks.zaloPersonalSendMessage
    });
    dependencyMocks.zaloPersonalSendMessage.mockResolvedValue({ id: "zalo-9002" });
    arrangeStoredMessage();

    await sendOutboundMessage(
      { conversationId: "conversation-1", content: "Hello Zalo group" },
      { id: "customer-1", email: "owner@example.com", role: "customer" }
    );

    expect(dependencyMocks.zaloPersonalSendMessage).toHaveBeenCalledWith(
      "chat-42",
      "Hello Zalo group",
      "group"
    );
  });

  it("namespaces equal outbound provider ids by Zalo account", async () => {
    const rows = [
      conversation({ _id: "conversation-1", platform: "zalo_personal", ownerId: "owner-1", assignedAgentId: null }),
      conversation({ _id: "conversation-2", platform: "zalo_personal", ownerId: "owner-2", assignedAgentId: null })
    ];
    dependencyMocks.findConversationById.mockImplementation(() => ({
      populate: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(rows.shift()) })
    }));
    dependencyMocks.getActiveZaloPersonalClient.mockImplementation(async (ownerId: string) => ({
      getAccountInfo: vi.fn().mockResolvedValue({ id: `zalo-${ownerId}` }),
      sendMessage: dependencyMocks.zaloPersonalSendMessage
    }));
    dependencyMocks.zaloPersonalSendMessage.mockResolvedValue({ id: "same-native-id" });
    arrangeStoredMessage();

    await sendOutboundMessage(
      { conversationId: "conversation-1", content: "First" },
      { id: "owner-1", email: "owner-1@example.com", role: "customer" }
    );
    await sendOutboundMessage(
      { conversationId: "conversation-2", content: "Second" },
      { id: "owner-2", email: "owner-2@example.com", role: "customer" }
    );

    expect(dependencyMocks.createMessage.mock.calls.map(([input]) => input.externalMessageId)).toEqual([
      "zalo_personal:zalo-owner-1:same-native-id",
      "zalo_personal:zalo-owner-2:same-native-id"
    ]);
  });

  it("persists a failed trace before rejecting a disconnected Zalo personal session", async () => {
    arrangeConversation(conversation({
      platform: "zalo_personal",
      assignedAgentId: null
    }));
    dependencyMocks.getActiveZaloPersonalClient.mockResolvedValue(undefined);
    arrangeStoredMessage();
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
    expect(dependencyMocks.createMessage).toHaveBeenCalledWith({
      conversationId: "conversation-1",
      platform: "zalo_personal",
      senderId: "agent",
      content: "Hello from Zalo support",
      externalMessageId: undefined,
      deliveryStatus: "failed",
      senderType: "agent",
      type: "text"
    });
  });

  it.each([{ ...agentAuth, workspace: { ownerUserId: "other-owner", allowedChannels: [] } }, { id: "admin-1", email: "admin@example.com", role: "admin" as const }])(
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

  it("persists an uncertain trace and hides Zalo connector failure details", async () => {
    arrangeConversation(conversation({
      platform: "zalo_personal",
      assignedAgentId: null
    }));
    dependencyMocks.getActiveZaloPersonalClient.mockResolvedValue({
      getAccountInfo: vi.fn().mockResolvedValue({ id: "zalo-account-1" }),
      sendMessage: dependencyMocks.zaloPersonalSendMessage
    });
    dependencyMocks.zaloPersonalSendMessage.mockRejectedValue(new Error("connector credential=secret-cookie failed"));
    arrangeStoredMessage();
    const ownerAuth = { id: "customer-1", email: "owner@example.com", role: "customer" } as const;

    await expect(sendOutboundMessage(
      { conversationId: "conversation-1", content: "Hello from Zalo support" },
      ownerAuth
    )).rejects.toMatchObject({
      statusCode: 502,
      code: "ZALO_PERSONAL_DELIVERY_FAILED",
      message: "Zalo personal message delivery failed"
    } satisfies Partial<AppError>);

    expect(dependencyMocks.createMessage).toHaveBeenCalledWith({
      conversationId: "conversation-1",
      platform: "zalo_personal",
      senderId: "agent",
      content: "Hello from Zalo support",
      externalMessageId: undefined,
      deliveryStatus: "pending",
      senderType: "agent",
      type: "text"
    });
    expect(JSON.stringify(dependencyMocks.createMessage.mock.calls)).not.toContain("secret-cookie");
  });

  it("persists unsupported-platform delivery as pending without an external id", async () => {
    arrangeConversation(conversation({ platform: "unsupported_platform" }));
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
      platform: "unsupported_platform",
      senderId: "agent",
      content: "Hello from support",
      externalMessageId: undefined,
      deliveryStatus: "pending",
      senderType: "agent",
      type: "text"
    });
  });

  it("sends Instagram text using the connected account token and conversation IGSID", async () => {
    arrangeConversation(conversation({
      platform: "instagram", channelId: "ig-1", customerId: { _id: "customer-1", name: "Customer One", platformId: "instagram:ig-1:igsid-7" }
    }));
    dependencyMocks.findMessage.mockReturnValue({
      sort: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ createdAt: now }) }) })
    });
    dependencyMocks.instagramSendText.mockResolvedValue({ externalMessageId: "mid-21" });
    arrangeStoredMessage();

    await sendOutboundMessage({ conversationId: "conversation-1", content: "Hello Instagram" }, agentAuth);

    expect(dependencyMocks.findInstagramConnection).toHaveBeenCalledWith({ instagramUserId: "ig-1", ownerUserId: "customer-1", status: "connected" });
    expect(dependencyMocks.decryptSecret).toHaveBeenCalledWith("ig-cipher");
    expect(dependencyMocks.instagramSendText).toHaveBeenCalledWith({ instagramUserId: "ig-1", accessToken: "page-access-token-secret", recipientId: "igsid-7", text: "Hello Instagram" });
    expect(dependencyMocks.createMessage).toHaveBeenCalledWith(expect.objectContaining({ platform: "instagram", externalMessageId: "instagram:ig-1:mid-21", deliveryStatus: "sent" }));
  });

  it("denies an Instagram customer ID scoped to another account before calling Meta", async () => {
    arrangeConversation(conversation({ platform: "instagram", channelId: "ig-1", customerId: { platformId: "instagram:other-ig:igsid-7" } }));
    await expect(sendOutboundMessage({ conversationId: "conversation-1", content: "Hello" }, agentAuth)).rejects.toMatchObject({ code: "INSTAGRAM_RECIPIENT_ACCOUNT_MISMATCH" });
    expect(dependencyMocks.instagramSendText).not.toHaveBeenCalled();
  });

  it("denies Instagram staff without an explicit channel grant before calling Meta", async () => {
    arrangeConversation(conversation({ platform: "instagram", channelId: "ig-1" }));
    const staff = { ...agentAuth, workspace: { ownerUserId: "customer-1", role: "staff", allowedChannels: [{ platform: "instagram", channelId: "ig-other" }] as WorkspaceChannelRef[] } };
    await expect(sendOutboundMessage({ conversationId: "conversation-1", content: "Hello" }, staff)).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
    expect(dependencyMocks.findInstagramConnection).not.toHaveBeenCalled();
    expect(dependencyMocks.instagramSendText).not.toHaveBeenCalled();
  });

  it("denies Instagram replies to Staff without an explicit account grant", async () => {
    arrangeConversation(conversation({
      platform: "instagram", channelId: "ig-1", customerId: { _id: "customer-1", name: "Customer One", platformId: "instagram:ig-1:igsid-7" }
    }));
    const staff = { ...agentAuth, workspace: {
      ownerUserId: "customer-1", role: "staff", allowedChannels: [], allowedPages: [],
      revokedChannels: [{ platform: "instagram", channelId: "ig-disconnected" }] as WorkspaceChannelRef[]
    } };

    await expect(sendOutboundMessage({ conversationId: "conversation-1", content: "Not granted" }, staff))
      .rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
    expect(dependencyMocks.findInstagramConnection).not.toHaveBeenCalled();
    expect(dependencyMocks.instagramSendText).not.toHaveBeenCalled();
  });

  it.each([null, { ownerUserId: "customer-1", instagramUserId: "ig-1", status: "connected", encryptedAccessToken: "cipher", tokenExpiresAt: new Date(now.getTime() - 1) }])(
    "rejects missing or expired Instagram credentials before calling Meta", async (credential) => {
      arrangeConversation(conversation({ platform: "instagram", channelId: "ig-1", customerId: { platformId: "instagram:ig-1:igsid-7" } }));
      dependencyMocks.findInstagramConnection.mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(credential) }) });
      dependencyMocks.findMessage.mockReturnValue({ sort: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ createdAt: now }) }) }) });
      await expect(sendOutboundMessage({ conversationId: "conversation-1", content: "Hello" }, agentAuth)).rejects.toMatchObject({ code: "INSTAGRAM_TOKEN_UNAVAILABLE" });
      expect(dependencyMocks.instagramSendText).not.toHaveBeenCalled();
    }
  );

  it("rejects Instagram replies outside the 24-hour response window", async () => {
    arrangeConversation(conversation({ platform: "instagram", channelId: "ig-1", customerId: { platformId: "instagram:ig-1:igsid-7" } }));
    dependencyMocks.findMessage.mockReturnValue({ sort: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ createdAt: new Date(now.getTime() - 24 * 60 * 60 * 1000) }) }) }) });
    await expect(sendOutboundMessage({ conversationId: "conversation-1", content: "Hello" }, agentAuth)).rejects.toMatchObject({ code: "INSTAGRAM_POLICY_WINDOW_CLOSED" });
    expect(dependencyMocks.instagramSendText).not.toHaveBeenCalled();
  });

  it("rejects Instagram text over 1000 UTF-8 bytes", async () => {
    arrangeConversation(conversation({ platform: "instagram", channelId: "ig-1", customerId: { platformId: "instagram:ig-1:igsid-7" } }));
    await expect(sendOutboundMessage({ conversationId: "conversation-1", content: "😀".repeat(251) }, agentAuth)).rejects.toMatchObject({ code: "INSTAGRAM_TEXT_TOO_LONG" });
    expect(dependencyMocks.instagramSendText).not.toHaveBeenCalled();
  });

  it("rejects blank Instagram text before credential lookup or provider delivery", async () => {
    arrangeConversation(conversation({ platform: "instagram", channelId: "ig-1", customerId: { platformId: "instagram:ig-1:igsid-7" } }));

    await expect(sendOutboundMessage({ conversationId: "conversation-1", content: " \n\t " }, agentAuth))
      .rejects.toMatchObject({ statusCode: 400, code: "INVALID_REQUEST" });

    expect(dependencyMocks.findInstagramConnection).not.toHaveBeenCalled();
    expect(dependencyMocks.instagramSendText).not.toHaveBeenCalled();
    expect(dependencyMocks.createMessage).not.toHaveBeenCalled();
  });

  it("keeps Meta policy errors permanent and does not persist a retryable send", async () => {
    arrangeConversation(conversation({ platform: "instagram", channelId: "ig-1", customerId: { platformId: "instagram:ig-1:igsid-7" } }));
    dependencyMocks.findMessage.mockReturnValue({ sort: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ createdAt: now }) }) }) });
    dependencyMocks.instagramSendText.mockRejectedValue(new AppError(422, "INSTAGRAM_POLICY_WINDOW_CLOSED", "window closed"));
    await expect(sendOutboundMessage({ conversationId: "conversation-1", content: "Hello" }, agentAuth)).rejects.toMatchObject({ code: "INSTAGRAM_POLICY_WINDOW_CLOSED" });
    expect(dependencyMocks.instagramSendText).toHaveBeenCalledTimes(1);
    expect(dependencyMocks.createMessage).toHaveBeenCalledWith(expect.objectContaining({ deliveryStatus: "failed", metadata: { errorCode: "INSTAGRAM_POLICY_WINDOW_CLOSED" } }));
  });

  it.each([
    { error: new AppError(422, "INSTAGRAM_POLICY_WINDOW_CLOSED", "window closed"), deliveryStatus: "failed" },
    { error: new AppError(502, "INSTAGRAM_DELIVERY_UNCERTAIN", "delivery uncertain"), deliveryStatus: "pending" }
  ] as const)("attaches a persisted $deliveryStatus trace for immediate socket updates without replacing the provider error", async ({ error, deliveryStatus }) => {
    arrangeConversation(conversation({
      platform: "instagram", channelId: "ig-1", customerId: { _id: "customer-1", name: "Customer One", platformId: "instagram:ig-1:igsid-7" }
    }));
    dependencyMocks.findMessage.mockReturnValue({ sort: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ createdAt: now }) }) }) });
    dependencyMocks.instagramSendText.mockRejectedValue(error);
    arrangeStoredMessage();

    let thrown: unknown;
    try {
      await sendOutboundMessage({ conversationId: "conversation-1", content: "Hello" }, agentAuth);
    } catch (caught) {
      thrown = caught;
    }

    expect(thrown).toBe(error);
    expect(thrown).toMatchObject({ outboundResult: { message: { platform: "instagram", content: "Hello", deliveryStatus } } });
    expect(dependencyMocks.pauseConversation).toHaveBeenCalledWith("conversation-1", expect.objectContaining({ $set: expect.objectContaining({ lastMessageSnippet: "Hello" }) }));
  });

  it("returns an Instagram webhook echo row when it wins the Send API persistence race", async () => {
    arrangeConversation(conversation({
      platform: "instagram", channelId: "ig-1", customerId: { platformId: "instagram:ig-1:igsid-7" }
    }));
    dependencyMocks.findMessage.mockImplementation((filter) => filter.externalMessageId
      ? { lean: vi.fn().mockResolvedValue({ _id: "echo-message", conversationId: "conversation-1", platform: "instagram", senderType: "agent", senderId: "customer-1", type: "text", content: "Hello", deliveryStatus: "sent", externalMessageId: "instagram:ig-1:mid-echo", createdAt: now }) }
      : { sort: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ createdAt: now }) }) }) });
    dependencyMocks.instagramSendText.mockResolvedValue({ externalMessageId: "mid-echo" });
    dependencyMocks.createMessage.mockRejectedValue(Object.assign(new Error("duplicate external message"), { code: 11000 }));

    const result = await sendOutboundMessage({ conversationId: "conversation-1", content: "Hello" }, agentAuth);

    expect(dependencyMocks.findMessage).toHaveBeenCalledWith({ platform: "instagram", externalMessageId: "instagram:ig-1:mid-echo" });
    expect(result.message).toMatchObject({ id: "echo-message", platform: "instagram", deliveryStatus: "sent" });
  });

  it("sends Facebook replies through the owning Page using only the raw PSID", async () => {
    arrangeConversation(conversation({
      platform: "facebook", channelId: "page-1", customerId: { _id: "customer-1", name: "Customer One", platformId: "facebook:page-1:psid-42" }
    }));
    dependencyMocks.findMessage.mockReturnValue({
      sort: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ createdAt: now }) })
      })
    });
    dependencyMocks.facebookSendText.mockResolvedValue({ externalMessageId: "mid-9001" });
    arrangeStoredMessage();

    const result = await sendOutboundMessage({ conversationId: "conversation-1", content: "Messenger reply" }, agentAuth);

    expect(dependencyMocks.findPageConnection).toHaveBeenCalledWith({ pageId: "page-1", userId: "customer-1", status: "connected" });
    expect(dependencyMocks.decryptSecret).toHaveBeenCalledWith("ciphertext");
    expect(dependencyMocks.facebookSendText).toHaveBeenCalledWith({ pageId: "page-1", pageAccessToken: "page-access-token-secret", psid: "psid-42", text: "Messenger reply" });
    expect(dependencyMocks.createMessage).toHaveBeenCalledWith(expect.objectContaining({ platform: "facebook", externalMessageId: "facebook:page-1:mid-9001", deliveryStatus: "sent" }));
    expect(result.message.deliveryStatus).toBe("sent");
    expect(dependencyMocks.pauseConversation).toHaveBeenCalledWith("conversation-1", {
      $set: { lastMessageAt: now, lastMessageSnippet: "Messenger reply" }
    });
    expect(result.recipients).toEqual(["customer-1", "agent-1"]);
  });

  it("rejects a Facebook Page connection owned by someone else before delivery", async () => {
    arrangeConversation(conversation({ platform: "facebook", channelId: "page-1", customerId: { _id: "customer-1", name: "Customer One", platformId: "facebook:page-1:psid-42" } }));
    dependencyMocks.findPageConnection.mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }) });
    dependencyMocks.findMessage.mockReturnValue({ sort: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ createdAt: now }) }) }) });

    await expect(sendOutboundMessage({ conversationId: "conversation-1", content: "Reply" }, agentAuth))
      .rejects.toMatchObject({ code: "FACEBOOK_PAGE_NOT_CONNECTED", statusCode: 409 });
    expect(dependencyMocks.findPageConnection).toHaveBeenCalledWith({ pageId: "page-1", userId: "customer-1", status: "connected" });
    expect(dependencyMocks.facebookSendText).not.toHaveBeenCalled();
    expect(dependencyMocks.createMessage).not.toHaveBeenCalled();
  });

  it("rejects at exactly 24 hours and allows a reply just inside the window", async () => {
    arrangeConversation(conversation({ platform: "facebook", channelId: "page-1", customerId: { _id: "customer-1", name: "Customer One", platformId: "facebook:page-1:psid-42" } }));
    const messageTime = new Date(now.getTime() - 24 * 60 * 60 * 1000 + 1);
    dependencyMocks.findMessage.mockReturnValue({ sort: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ createdAt: messageTime }) }) }) });
    dependencyMocks.facebookSendText.mockResolvedValue({ externalMessageId: "mid-9001" });
    arrangeStoredMessage();
    await sendOutboundMessage({ conversationId: "conversation-1", content: "Just inside" }, agentAuth);
    expect(dependencyMocks.facebookSendText).toHaveBeenCalledOnce();

    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    dependencyMocks.acquireSendLease.mockReturnValue({ lean: async () => ({ _id: "conversation-1" }) });
    dependencyMocks.releaseSendLease.mockResolvedValue({ matchedCount: 1 });
    dependencyMocks.facebookSendText.mockResolvedValue({ externalMessageId: "mid-at-limit" });
    arrangeStoredMessage();
    arrangeConversation(conversation({ platform: "facebook", channelId: "page-1", customerId: { _id: "customer-1", name: "Customer One", platformId: "facebook:page-1:psid-42" } }));
    dependencyMocks.findMessage.mockReturnValue({ sort: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ createdAt: new Date(messageTime.getTime() - 1) }) }) }) });
    dependencyMocks.findPageConnection.mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ userId: "customer-1", pageId: "page-1", encryptedPageAccessToken: "ciphertext", status: "connected" }) }) });
    await expect(sendOutboundMessage({ conversationId: "conversation-1", content: "At limit" }, agentAuth))
      .rejects.toMatchObject({ code: "FACEBOOK_MESSENGER_POLICY_WINDOW_CLOSED", statusCode: 422 });
    expect(dependencyMocks.facebookSendText).not.toHaveBeenCalled();
  });

  it("returns the webhook echo row when it wins the Send API persistence race", async () => {
    arrangeConversation(conversation({ platform: "facebook", channelId: "page-1", customerId: { _id: "customer-1", name: "Customer One", platformId: "facebook:page-1:psid-42" } }));
    dependencyMocks.findMessage.mockImplementation((filter: Record<string, unknown>) => {
      if (filter.senderType === "customer") return { sort: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ createdAt: now }) }) }) };
      return { lean: vi.fn().mockResolvedValue({ _id: "echo-message", conversationId: "conversation-1", platform: "facebook", senderType: "agent", senderId: "customer-1", type: "text", content: "Reply", deliveryStatus: "sent", externalMessageId: "facebook:page-1:mid-echo", createdAt: now }) };
    });
    dependencyMocks.facebookSendText.mockResolvedValue({ externalMessageId: "mid-echo" });
    dependencyMocks.createMessage.mockRejectedValue(Object.assign(new Error("duplicate"), { code: 11000 }));

    const result = await sendOutboundMessage({ conversationId: "conversation-1", content: "Reply", clientMessageId: "client-echo-1" }, agentAuth);

    expect(dependencyMocks.findMessage).toHaveBeenCalledWith({ platform: "facebook", externalMessageId: "facebook:page-1:mid-echo" });
    expect(result.message.id).toBe("echo-message");
    expect(result.message.clientMessageId).toBe("client-echo-1");
    expect(dependencyMocks.createMessage).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["FACEBOOK_MESSENGER_PERMISSION_DENIED", 403],
    ["FACEBOOK_MESSENGER_TIMEOUT", 504]
  ])("keeps Messenger %s failures safe and never reports sent", async (code, statusCode) => {
    arrangeConversation(conversation({ platform: "facebook", channelId: "page-1", customerId: { _id: "customer-1", name: "Customer One", platformId: "facebook:page-1:psid-42" } }));
    dependencyMocks.findMessage.mockReturnValue({ sort: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ createdAt: now }) }) }) });
    dependencyMocks.facebookSendText.mockRejectedValue(new AppError(statusCode, code, "token=page-access-token-secret"));

    await expect(sendOutboundMessage({ conversationId: "conversation-1", content: "Reply" }, agentAuth))
      .rejects.toMatchObject({ code, statusCode });
    expect(dependencyMocks.createMessage).not.toHaveBeenCalled();
    expect(JSON.stringify(dependencyMocks.createMessage.mock.calls)).not.toContain("page-access-token-secret");
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
    arrangeConversation(conversation({ ownerId: "other-owner", assignedAgentId: "agent-2" }));

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
        ownerId: stage === "personal delivery" ? "agent-1" : "customer-1"
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
        { conversationId: "conversation-1", content: "Hello" }, stage === "personal delivery"
          ? { id: "agent-1", email: "agent@example.com", role: "agent" }
          : agentAuth
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
    arrangeConversation(conversation({ platform: "unsupported_platform", ownerId: null, assignedAgentId: null }));
    arrangeStoredMessage();

    const result = await sendOutboundMessage(
      { conversationId: "conversation-1", content: "Admin reply" },
      { id: "admin-1", email: "admin@example.com", role: "admin" }
    );

    expect(result.message.content).toBe("Admin reply");
    expect(result.recipients).toEqual(["", ""]);
    expect(dependencyMocks.createMessage).toHaveBeenCalledTimes(1);
  });

  it.each([{ ...agentAuth, workspace: { ownerUserId: "other-owner", allowedChannels: [] } }, { id: "admin-1", email: "admin@example.com", role: "admin" as const }])(
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
