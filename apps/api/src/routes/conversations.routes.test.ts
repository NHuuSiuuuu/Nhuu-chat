import { describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const routeMocks = vi.hoisted(() => ({
  requireRole: vi.fn((_adminRole: string, _agentRole: string) => (_request: unknown, _response: unknown, next: () => void) => next()),
  getConversationReplySuggestions: vi.fn((_request: unknown, response: { sendStatus: (status: number) => unknown }) => response.sendStatus(204)),
  updateBotEnabled: vi.fn()
}));

vi.mock("../auth/auth.middleware.js", () => ({ requireRole: routeMocks.requireRole }));
vi.mock("../controllers/conversations.controller.js", () => ({
  listConversations: vi.fn(),
  markConversationRead: vi.fn(),
  updateAssignment: vi.fn(),
  updateBotEnabled: routeMocks.updateBotEnabled,
  updateStatus: vi.fn(),
  updateConversationTags: vi.fn(),
  getConversationReplySuggestions: routeMocks.getConversationReplySuggestions
}));
vi.mock("../controllers/messages.controller.js", () => ({ listMessages: vi.fn() }));

import { conversationRouter } from "./conversations.routes.js";

describe("conversation suggestions route", () => {
  it("registers the bot switch endpoint for admins and agents", () => {
    const route = conversationRouter.stack.find((layer) => layer.route?.path === "/:id/bot");

    expect(route?.route?.path).toBe("/:id/bot");
    expect(routeMocks.requireRole).toHaveBeenCalledWith("admin", "agent");
  });

  it("registers the AI suggestions endpoint as POST and protects it for admins and agents", async () => {
    const route = conversationRouter.stack.find((layer) => layer.route?.path === "/:id/ai-suggestions");

    expect(route?.route?.path).toBe("/:id/ai-suggestions");
    expect(route?.route?.stack.at(-1)?.handle).toBe(routeMocks.getConversationReplySuggestions);
    expect(routeMocks.requireRole).toHaveBeenCalledWith("admin", "agent");

    const app = express();
    app.use(conversationRouter);

    await expect(request(app).post("/conversation-1/ai-suggestions")).resolves.toMatchObject({ status: 204 });
    await expect(request(app).get("/conversation-1/ai-suggestions")).resolves.toMatchObject({ status: 404 });
  });
});
