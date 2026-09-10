import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "../common/errors.js";

const serviceMocks = vi.hoisted(() => ({
  createOutboundMessage: vi.fn(),
  listConversations: vi.fn(),
  listMessages: vi.fn(),
  markConversationRead: vi.fn(),
  updateAssignment: vi.fn(),
  updateStatus: vi.fn()
}));

const conversationModelMocks = vi.hoisted(() => ({
  exists: vi.fn(),
  findById: vi.fn()
}));

const socketMocks = vi.hoisted(() => ({
  emitChatEvent: vi.fn(),
  emitInboxEventToRecipients: vi.fn()
}));

vi.mock("../services/conversation.service.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../services/conversation.service.js")>(),
  listConversations: serviceMocks.listConversations,
  markConversationRead: serviceMocks.markConversationRead,
  updateAssignment: serviceMocks.updateAssignment,
  updateStatus: serviceMocks.updateStatus
}));

vi.mock("../services/message.service.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../services/message.service.js")>(),
  createOutboundMessage: serviceMocks.createOutboundMessage,
  listMessages: serviceMocks.listMessages
}));

vi.mock("../models/conversation.model.js", () => ({
  ConversationModel: conversationModelMocks
}));

vi.mock("../realtime/socket.js", () => socketMocks);

import {
  listConversations,
  markConversationRead,
  updateAssignment,
  updateStatus
} from "./conversations.controller.js";
import { listMessages, sendMessage } from "./messages.controller.js";

function responseRecorder() {
  const state: { body?: unknown; statusCode: number } = { statusCode: 200 };
  const response = {
    json(body: unknown) {
      state.body = body;
      return response;
    },
    status(statusCode: number) {
      state.statusCode = statusCode;
      return response;
    }
  };
  return { response, state };
}

const adminAuth = { id: "admin-1", email: "admin@example.com", role: "admin" } as const;

describe("conversation controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the conversation list from the service", async () => {
    const expected = { conversations: [], total: 0 };
    serviceMocks.listConversations.mockResolvedValue(expected);
    const { response, state } = responseRecorder();
    const next = vi.fn();

    await listConversations({ auth: adminAuth, query: {} } as never, response as never, next);

    expect(state.body).toEqual(expected);
    expect(next).not.toHaveBeenCalled();
  });

  it("scopes an agent's message lookup to assigned conversations", async () => {
    conversationModelMocks.exists.mockResolvedValue(true);
    serviceMocks.listMessages.mockResolvedValue({ messages: [], total: 0 });
    const { response, state } = responseRecorder();
    const next = vi.fn();

    await listMessages({
      auth: { id: "agent-1", email: "agent@example.com", role: "agent" },
      params: { id: "conversation-1" },
      query: {}
    } as never, response as never, next);

    expect(conversationModelMocks.exists).toHaveBeenCalledWith({
      _id: "conversation-1",
      assignedAgentId: "agent-1"
    });
    expect(state.body).toEqual({ messages: [], total: 0 });
    expect(next).not.toHaveBeenCalled();
  });

  it("marks a visible conversation as read and emits its update", async () => {
    conversationModelMocks.findById.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ ownerId: "customer-1", assignedAgentId: "agent-1" })
    });
    const expected = { id: "conversation-1", unreadCount: 0 };
    serviceMocks.markConversationRead.mockResolvedValue(expected);
    const { response, state } = responseRecorder();
    const next = vi.fn();

    await markConversationRead({
      auth: adminAuth,
      params: { id: "conversation-1" }
    } as never, response as never, next);

    expect(socketMocks.emitInboxEventToRecipients).toHaveBeenCalledWith(
      "chat:conversation_updated",
      ["customer-1", "agent-1"],
      expected
    );
    expect(state.body).toEqual(expected);
    expect(next).not.toHaveBeenCalled();
  });

  it("updates assignment and emits the conversation update", async () => {
    const expected = { id: "conversation-1", assignedAgentId: "agent-1" };
    serviceMocks.updateAssignment.mockResolvedValue(expected);
    const { response, state } = responseRecorder();
    const next = vi.fn();

    await updateAssignment({
      params: { id: "conversation-1" },
      body: { assignedAgentId: "agent-1" }
    } as never, response as never, next);

    expect(socketMocks.emitChatEvent).toHaveBeenCalledWith(
      "chat:conversation_updated",
      "conversation-1",
      expected
    );
    expect(state.body).toEqual(expected);
    expect(next).not.toHaveBeenCalled();
  });

  it("updates status and emits the conversation update", async () => {
    const expected = { id: "conversation-1", status: "closed" };
    serviceMocks.updateStatus.mockResolvedValue(expected);
    const { response, state } = responseRecorder();
    const next = vi.fn();

    await updateStatus({
      params: { id: "conversation-1" },
      body: { status: "closed" }
    } as never, response as never, next);

    expect(socketMocks.emitChatEvent).toHaveBeenCalledWith(
      "chat:conversation_updated",
      "conversation-1",
      expected
    );
    expect(state.body).toEqual(expected);
    expect(next).not.toHaveBeenCalled();
  });
});

describe("message controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects malformed outbound input before persistence", async () => {
    const { response } = responseRecorder();
    const next = vi.fn();

    await sendMessage({ body: { conversationId: 42, type: "text", content: "Hello" } } as never, response as never, next);

    const error = next.mock.calls[0]?.[0];
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ statusCode: 400, code: "INVALID_REQUEST" });
    expect(serviceMocks.createOutboundMessage).not.toHaveBeenCalled();
  });

  it("creates an outbound message with the existing response contract", async () => {
    conversationModelMocks.findById.mockReturnValue({
      populate: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: "conversation-1",
          platform: "email",
          channelId: "channel-1",
          ownerId: "customer-1",
          assignedAgentId: null,
          customerId: "customer-1",
          unreadCount: 0,
          status: "open",
          lastMessageAt: "2026-09-10T00:00:00.000Z",
          lastMessageSnippet: "Previous"
        })
      })
    });
    serviceMocks.createOutboundMessage.mockResolvedValue({
      toObject: () => ({
        _id: "message-1",
        conversationId: "conversation-1",
        platform: "email",
        senderType: "agent",
        senderId: "agent",
        type: "text",
        content: "Hello",
        deliveryStatus: "pending",
        createdAt: "2026-09-10T00:00:01.000Z"
      })
    });
    const { response, state } = responseRecorder();
    const next = vi.fn();

    await sendMessage({
      auth: { id: "customer-1", email: "customer@example.com", role: "customer" },
      body: { conversationId: "conversation-1", type: "text", content: "Hello" }
    } as never, response as never, next);

    expect(state.statusCode).toBe(201);
    expect(state.body).toMatchObject({
      id: "message-1",
      conversationId: "conversation-1",
      type: "text",
      content: "Hello",
      deliveryStatus: "pending"
    });
    expect(next).not.toHaveBeenCalled();
  });
});
