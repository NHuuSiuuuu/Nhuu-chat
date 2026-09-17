import express, { type ErrorRequestHandler } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { chatEvents, type PinnedMessageContract } from "@nhuu-chat/contracts";

const pinServiceMocks = vi.hoisted(() => ({
  listConversationPins: vi.fn(),
  pinConversationMessage: vi.fn(),
  unpinConversationMessage: vi.fn()
}));
const socketMocks = vi.hoisted(() => ({ emitChatEvent: vi.fn() }));

vi.mock("../services/conversation-pin.service.js", () => pinServiceMocks);
vi.mock("../realtime/socket.js", () => socketMocks);

import { AppError, errorHandler } from "../common/errors.js";
import {
  listConversationPins,
  pinConversationMessage,
  unpinConversationMessage
} from "./conversation-pins.controller.js";

const agentAuth = { id: "agent-1", email: "agent@example.com", role: "agent" as const };
const pinnedMessage: PinnedMessageContract = {
  messageId: "message-1",
  content: "Tin cần ghim",
  type: "text",
  senderName: "Khách hàng",
  createdAt: "2026-09-17T08:00:00.000Z",
  pinnedBy: "agent-1",
  pinnedAt: "2026-09-17T08:10:00.000Z"
};

function createTestApp(options: { authenticated?: boolean } = { authenticated: true }) {
  const app = express();
  app.use(express.json());
  if (options.authenticated !== false) {
    app.use((incomingRequest, _response, next) => {
      (incomingRequest as express.Request & { auth?: typeof agentAuth }).auth = agentAuth;
      next();
    });
  }
  app.get("/conversations/:conversationId/pins", listConversationPins);
  app.post("/conversations/:conversationId/pins", pinConversationMessage);
  app.delete("/conversations/:conversationId/pins/:messageId", unpinConversationMessage);
  const captureError: ErrorRequestHandler = (error, incomingRequest, response, next) => {
    errorHandler(error, incomingRequest, response, next);
  };
  app.use(captureError);
  return app;
}

describe("conversation pin controller", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns the canonical pin list for an authenticated agent", async () => {
    pinServiceMocks.listConversationPins.mockResolvedValue({ pinnedMessages: [pinnedMessage] });

    const response = await request(createTestApp()).get("/conversations/conversation-1/pins");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      conversationId: "conversation-1",
      pinnedMessages: [pinnedMessage]
    });
    expect(pinServiceMocks.listConversationPins).toHaveBeenCalledWith("conversation-1", agentAuth);
  });

  it("creates a pin and emits the canonical list after the service succeeds", async () => {
    pinServiceMocks.pinConversationMessage.mockResolvedValue({ pinnedMessages: [pinnedMessage] });

    const response = await request(createTestApp())
      .post("/conversations/conversation-1/pins")
      .send({ messageId: "message-1" });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      conversationId: "conversation-1",
      pinnedMessages: [pinnedMessage]
    });
    expect(pinServiceMocks.pinConversationMessage).toHaveBeenCalledWith(
      "conversation-1",
      "message-1",
      agentAuth
    );
    expect(socketMocks.emitChatEvent).toHaveBeenCalledWith(
      chatEvents.messagePinUpdated,
      "conversation-1",
      { conversationId: "conversation-1", pinnedMessages: [pinnedMessage] }
    );
  });

  it("removes a pin and emits the canonical list after the service succeeds", async () => {
    pinServiceMocks.unpinConversationMessage.mockResolvedValue({ pinnedMessages: [] });

    const response = await request(createTestApp())
      .delete("/conversations/conversation-1/pins/message-1");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ conversationId: "conversation-1", pinnedMessages: [] });
    expect(pinServiceMocks.unpinConversationMessage).toHaveBeenCalledWith(
      "conversation-1",
      "message-1",
      agentAuth
    );
    expect(socketMocks.emitChatEvent).toHaveBeenCalledWith(
      chatEvents.messagePinUpdated,
      "conversation-1",
      { conversationId: "conversation-1", pinnedMessages: [] }
    );
  });

  it("rejects invalid pin input before invoking the service", async () => {
    const response = await request(createTestApp())
      .post("/conversations/conversation-1/pins")
      .send({ messageId: "   " });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_REQUEST");
    expect(pinServiceMocks.pinConversationMessage).not.toHaveBeenCalled();
    expect(socketMocks.emitChatEvent).not.toHaveBeenCalled();
  });

  it("rejects an invalid conversation id before invoking the service", async () => {
    const next = vi.fn();

    await listConversationPins(
      { params: { conversationId: "" } } as never,
      {} as never,
      next
    );

    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      statusCode: 400,
      code: "INVALID_REQUEST"
    }));
    expect(pinServiceMocks.listConversationPins).not.toHaveBeenCalled();
  });

  it("forwards service errors without emitting a realtime event", async () => {
    const failure = new AppError(404, "MESSAGE_NOT_FOUND", "Message was not found");
    pinServiceMocks.pinConversationMessage.mockRejectedValue(failure);

    const response = await request(createTestApp())
      .post("/conversations/conversation-1/pins")
      .send({ messageId: "message-1" });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("MESSAGE_NOT_FOUND");
    expect(socketMocks.emitChatEvent).not.toHaveBeenCalled();
  });

  it("does not emit when removing a pin fails", async () => {
    const failure = new AppError(404, "CONVERSATION_NOT_FOUND", "Conversation was not found");
    pinServiceMocks.unpinConversationMessage.mockRejectedValue(failure);

    const response = await request(createTestApp())
      .delete("/conversations/conversation-1/pins/message-1");

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("CONVERSATION_NOT_FOUND");
    expect(socketMocks.emitChatEvent).not.toHaveBeenCalled();
  });

  it("rejects a request that has no authenticated user", async () => {
    const response = await request(createTestApp({ authenticated: false }))
      .get("/conversations/conversation-1/pins");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTHENTICATION_REQUIRED");
    expect(pinServiceMocks.listConversationPins).not.toHaveBeenCalled();
  });
});
