import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "../common/errors.js";

const serviceMocks = vi.hoisted(() => ({
  listConversations: vi.fn(),
  listMessages: vi.fn(),
  markConversationRead: vi.fn(),
  sendOutboundMessage: vi.fn(),
  updateAssignment: vi.fn(),
  updateStatus: vi.fn(),
  updateConversationTags: vi.fn(),
  getConversationReplySuggestions: vi.fn()
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
  updateStatus: serviceMocks.updateStatus,
  updateConversationTags: serviceMocks.updateConversationTags,
  getConversationReplySuggestions: serviceMocks.getConversationReplySuggestions
}));

vi.mock("../services/message.service.js", () => ({
  listMessages: serviceMocks.listMessages,
  sendOutboundMessage: serviceMocks.sendOutboundMessage
}));

vi.mock("../models/conversation.model.js", () => ({
  ConversationModel: conversationModelMocks
}));

vi.mock("../realtime/socket.js", () => socketMocks);

import {
  listConversations,
  markConversationRead,
  updateAssignment,
  updateStatus,
  updateConversationTags,
  getConversationReplySuggestions
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
    vi.resetAllMocks();
  });

  it("rejects unauthenticated AI suggestion requests", async () => {
    const { response } = responseRecorder();
    const next = vi.fn();

    await getConversationReplySuggestions({ params: { id: "conversation-1" } } as never, response as never, next);

    expect(next.mock.calls[0]?.[0]).toMatchObject({ statusCode: 401, code: "AUTHENTICATION_REQUIRED" });
    expect(serviceMocks.getConversationReplySuggestions).not.toHaveBeenCalled();
  });

  it("returns AI suggestions and their source from the service", async () => {
    const expected = { suggestions: ["Gợi ý 1", "Gợi ý 2", "Gợi ý 3"], source: "gemini" as const };
    serviceMocks.getConversationReplySuggestions.mockResolvedValue(expected);
    const { response, state } = responseRecorder();
    const next = vi.fn();

    await getConversationReplySuggestions({ auth: adminAuth, params: { id: "conversation-1" } } as never, response as never, next);

    expect(serviceMocks.getConversationReplySuggestions).toHaveBeenCalledWith("conversation-1", adminAuth);
    expect(state.body).toEqual(expected);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns sanitized fallback data without provider error details", async () => {
    serviceMocks.getConversationReplySuggestions.mockResolvedValue({
      suggestions: ["Dạ, em sẽ kiểm tra giúp anh/chị ạ."],
      source: "fallback"
    });
    const { response, state } = responseRecorder();
    const next = vi.fn();

    await getConversationReplySuggestions({ auth: adminAuth, params: { id: "conversation-1" } } as never, response as never, next);

    expect(state.body).toEqual({
      suggestions: ["Dạ, em sẽ kiểm tra giúp anh/chị ạ."],
      source: "fallback"
    });
    expect(JSON.stringify(state.body)).not.toContain("GEMINI_API_KEY is not configured");
    expect(next).not.toHaveBeenCalled();
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

  it("rejects invalid conversation pagination before calling the service", async () => {
    const { response } = responseRecorder();
    const next = vi.fn();

    await listConversations({ auth: adminAuth, query: { page: "0" } } as never, response as never, next);

    expect(next.mock.calls[0]?.[0]).toMatchObject({
      statusCode: 400,
      code: "INVALID_PAGINATION"
    });
    expect(serviceMocks.listConversations).not.toHaveBeenCalled();
    expect(socketMocks.emitChatEvent).not.toHaveBeenCalled();
    expect(socketMocks.emitInboxEventToRecipients).not.toHaveBeenCalled();
  });

  it("requires authentication before listing conversations", async () => {
    const { response } = responseRecorder();
    const next = vi.fn();

    await listConversations({ query: {} } as never, response as never, next);

    expect(next.mock.calls[0]?.[0]).toMatchObject({
      statusCode: 401,
      code: "AUTHENTICATION_REQUIRED"
    });
    expect(serviceMocks.listConversations).not.toHaveBeenCalled();
  });

  it("forwards conversation-list service errors without emitting", async () => {
    const failure = new Error("list failed");
    serviceMocks.listConversations.mockRejectedValue(failure);
    const { response } = responseRecorder();
    const next = vi.fn();

    await listConversations({ auth: adminAuth, query: {} } as never, response as never, next);

    expect(next).toHaveBeenCalledWith(failure);
    expect(socketMocks.emitChatEvent).not.toHaveBeenCalled();
    expect(socketMocks.emitInboxEventToRecipients).not.toHaveBeenCalled();
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

  it("rejects invalid message pagination before listing messages", async () => {
    conversationModelMocks.exists.mockResolvedValue(true);
    const { response } = responseRecorder();
    const next = vi.fn();

    await listMessages({
      auth: adminAuth,
      params: { id: "conversation-1" },
      query: { limit: "0" }
    } as never, response as never, next);

    expect(next.mock.calls[0]?.[0]).toMatchObject({
      statusCode: 400,
      code: "INVALID_PAGINATION"
    });
    expect(serviceMocks.listMessages).not.toHaveBeenCalled();
    expect(socketMocks.emitChatEvent).not.toHaveBeenCalled();
    expect(socketMocks.emitInboxEventToRecipients).not.toHaveBeenCalled();
  });

  it("requires authentication before listing messages", async () => {
    const { response } = responseRecorder();
    const next = vi.fn();

    await listMessages({
      params: { id: "conversation-1" },
      query: {}
    } as never, response as never, next);

    expect(next.mock.calls[0]?.[0]).toMatchObject({
      statusCode: 401,
      code: "AUTHENTICATION_REQUIRED"
    });
    expect(conversationModelMocks.exists).not.toHaveBeenCalled();
    expect(serviceMocks.listMessages).not.toHaveBeenCalled();
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

  it("does not emit when marking a conversation read fails", async () => {
    conversationModelMocks.findById.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ ownerId: "customer-1", assignedAgentId: "agent-1" })
    });
    const failure = new AppError(404, "CONVERSATION_NOT_FOUND", "Conversation was not found");
    serviceMocks.markConversationRead.mockRejectedValue(failure);
    const { response, state } = responseRecorder();
    const next = vi.fn();

    await markConversationRead({
      auth: adminAuth,
      params: { id: "conversation-1" }
    } as never, response as never, next);

    expect(next).toHaveBeenCalledWith(failure);
    expect(state.body).toBeUndefined();
    expect(socketMocks.emitChatEvent).not.toHaveBeenCalled();
    expect(socketMocks.emitInboxEventToRecipients).not.toHaveBeenCalled();
  });

  it("forwards a mark-read lookup failure without updating or emitting", async () => {
    const failure = new Error("database unavailable");
    conversationModelMocks.findById.mockReturnValue({ lean: vi.fn().mockRejectedValue(failure) });
    const { response, state } = responseRecorder();
    const next = vi.fn();

    await markConversationRead({ auth: adminAuth, params: { id: "conversation-1" } } as never, response as never, next);

    expect(next).toHaveBeenCalledWith(failure);
    expect(serviceMocks.markConversationRead).not.toHaveBeenCalled();
    expect(socketMocks.emitChatEvent).not.toHaveBeenCalled();
    expect(socketMocks.emitInboxEventToRecipients).not.toHaveBeenCalled();
    expect(state.body).toBeUndefined();
  });

  it.each([markConversationRead, updateAssignment, updateStatus])(
    "rejects a missing conversation id without mutations or events (%s)", async (handler) => {
      const { response, state } = responseRecorder();
      const next = vi.fn();

      await handler({ auth: adminAuth, params: {}, body: {} } as never, response as never, next);

      expect(next.mock.calls[0]?.[0]).toMatchObject({ statusCode: 400, code: "INVALID_REQUEST" });
      expect(serviceMocks.markConversationRead).not.toHaveBeenCalled();
      expect(serviceMocks.updateAssignment).not.toHaveBeenCalled();
      expect(serviceMocks.updateStatus).not.toHaveBeenCalled();
      expect(socketMocks.emitChatEvent).not.toHaveBeenCalled();
      expect(socketMocks.emitInboxEventToRecipients).not.toHaveBeenCalled();
      expect(state.body).toBeUndefined();
    }
  );

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

  it("rejects an invalid assignment body without calling the service or emitting", async () => {
    const { response } = responseRecorder();
    const next = vi.fn();

    await updateAssignment({
      params: { id: "conversation-1" },
      body: { assignedAgentId: 7 }
    } as never, response as never, next);

    expect(next.mock.calls[0]?.[0]).toMatchObject({ statusCode: 400, code: "INVALID_REQUEST" });
    expect(serviceMocks.updateAssignment).not.toHaveBeenCalled();
    expect(socketMocks.emitChatEvent).not.toHaveBeenCalled();
  });

  it("does not emit when assignment service update fails", async () => {
    const failure = new Error("assignment failed");
    serviceMocks.updateAssignment.mockRejectedValue(failure);
    const { response, state } = responseRecorder();
    const next = vi.fn();

    await updateAssignment({
      params: { id: "conversation-1" },
      body: { assignedAgentId: "agent-1" }
    } as never, response as never, next);

    expect(next).toHaveBeenCalledWith(failure);
    expect(socketMocks.emitChatEvent).not.toHaveBeenCalled();
    expect(socketMocks.emitInboxEventToRecipients).not.toHaveBeenCalled();
    expect(state.body).toBeUndefined();
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

  it("replaces conversation tags and emits the updated conversation", async () => {
    const expected = { id: "conversation-1", tags: [{ id: "tag-1", name: "Mua hàng", color: "#22c55e" }] };
    serviceMocks.updateConversationTags.mockResolvedValue(expected);
    conversationModelMocks.findById.mockReturnValue({ lean: vi.fn().mockResolvedValue({ ownerId: "owner-1", assignedAgentId: "agent-1" }) });
    const { response, state } = responseRecorder();
    const next = vi.fn();

    await updateConversationTags({ auth: adminAuth, params: { id: "conversation-1" }, body: { tagIds: ["tag-1"] } } as never, response as never, next);

    expect(serviceMocks.updateConversationTags).toHaveBeenCalledWith("conversation-1", ["tag-1"], adminAuth);
    expect(socketMocks.emitInboxEventToRecipients).toHaveBeenCalledWith("chat:conversation_updated", ["owner-1", "agent-1"], expected);
    expect(state.body).toEqual(expected);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects an invalid conversation tag payload", async () => {
    const { response, state } = responseRecorder();
    const next = vi.fn();

    await updateConversationTags({ auth: adminAuth, params: { id: "conversation-1" }, body: { tagIds: [7] } } as never, response as never, next);

    expect(next.mock.calls[0]?.[0]).toMatchObject({ statusCode: 400, code: "INVALID_REQUEST" });
    expect(serviceMocks.updateConversationTags).not.toHaveBeenCalled();
    expect(state.body).toBeUndefined();
  });

  it("rejects an invalid status body without calling the service or emitting", async () => {
    const { response } = responseRecorder();
    const next = vi.fn();

    await updateStatus({
      params: { id: "conversation-1" },
      body: { status: "archived" }
    } as never, response as never, next);

    expect(next.mock.calls[0]?.[0]).toMatchObject({ statusCode: 400, code: "INVALID_REQUEST" });
    expect(serviceMocks.updateStatus).not.toHaveBeenCalled();
    expect(socketMocks.emitChatEvent).not.toHaveBeenCalled();
  });

  it("does not emit when status service update fails", async () => {
    const failure = new Error("status failed");
    serviceMocks.updateStatus.mockRejectedValue(failure);
    const { response, state } = responseRecorder();
    const next = vi.fn();

    await updateStatus({
      params: { id: "conversation-1" },
      body: { status: "closed" }
    } as never, response as never, next);

    expect(next).toHaveBeenCalledWith(failure);
    expect(socketMocks.emitChatEvent).not.toHaveBeenCalled();
    expect(socketMocks.emitInboxEventToRecipients).not.toHaveBeenCalled();
    expect(state.body).toBeUndefined();
  });
});

describe("message controller", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("rejects malformed outbound input before persistence", async () => {
    const { response } = responseRecorder();
    const next = vi.fn();

    await sendMessage({ body: { conversationId: 42, type: "text", content: "Hello" } } as never, response as never, next);

    const error = next.mock.calls[0]?.[0];
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ statusCode: 400, code: "INVALID_REQUEST" });
    expect(serviceMocks.sendOutboundMessage).not.toHaveBeenCalled();
    expect(socketMocks.emitChatEvent).not.toHaveBeenCalled();
    expect(socketMocks.emitInboxEventToRecipients).not.toHaveBeenCalled();
  });

  it.each([
    ["facebook", "pending"],
    ["telegram", "sent"],
    ["telegram_personal", "sent"]
  ])("emits all outbound updates and returns HTTP 201 for %s", async (platform, deliveryStatus) => {
    const message = {
      id: "message-1",
      conversationId: "conversation-1",
      platform,
      senderType: "agent",
      senderId: "agent",
      type: "text",
      content: "Hello",
      deliveryStatus,
      createdAt: "2026-09-10T00:00:01.000Z"
    };
    const conversation = {
      id: "conversation-1",
      lastMessageAt: "2026-09-10T00:00:01.000Z",
      lastMessageSnippet: "Hello"
    };
    serviceMocks.sendOutboundMessage.mockResolvedValue({
      message,
      conversation,
      recipients: ["customer-1", "agent-1"]
    });
    const { response, state } = responseRecorder();
    const next = vi.fn();

    const auth = { id: "customer-1", email: "customer@example.com", role: "customer" } as const;

    await sendMessage({
      auth,
      body: { conversationId: "conversation-1", type: "text", content: "Hello" }
    } as never, response as never, next);

    expect(serviceMocks.sendOutboundMessage).toHaveBeenCalledWith(
      { conversationId: "conversation-1", content: "Hello" },
      auth
    );
    expect(socketMocks.emitChatEvent).toHaveBeenNthCalledWith(
      1,
      "chat:message_received",
      "conversation-1",
      message
    );
    expect(socketMocks.emitChatEvent).toHaveBeenNthCalledWith(
      2,
      "chat:delivery_updated",
      "conversation-1",
      message
    );
    expect(socketMocks.emitInboxEventToRecipients).toHaveBeenCalledWith(
      "chat:conversation_updated",
      ["customer-1", "agent-1"],
      conversation
    );
    expect(socketMocks.emitChatEvent).toHaveBeenCalledTimes(2);
    expect(socketMocks.emitInboxEventToRecipients).toHaveBeenCalledTimes(1);
    expect(state.statusCode).toBe(201);
    expect(state.body).toEqual(message);
    expect(next).not.toHaveBeenCalled();
  });

  it.each([
    new AppError(403, "FORBIDDEN", "You do not have access to this conversation"),
    new AppError(404, "CONVERSATION_NOT_FOUND", "Conversation was not found"),
    new AppError(409, "TELEGRAM_PERSONAL_DISCONNECTED", "Telegram personal session is not active"),
    new Error("delivery failed"),
    new Error("persistence failed")
  ])("forwards outbound failure %s without emitting or responding", async (failure) => {
    serviceMocks.sendOutboundMessage.mockRejectedValue(failure);
    const { response, state } = responseRecorder();
    const next = vi.fn();

    await sendMessage({
      auth: adminAuth,
      body: { conversationId: "conversation-1", type: "text", content: "Hello" }
    } as never, response as never, next);

    expect(next).toHaveBeenCalledWith(failure);
    expect(socketMocks.emitChatEvent).not.toHaveBeenCalled();
    expect(socketMocks.emitInboxEventToRecipients).not.toHaveBeenCalled();
    expect(state.statusCode).toBe(200);
    expect(state.body).toBeUndefined();
  });
});
