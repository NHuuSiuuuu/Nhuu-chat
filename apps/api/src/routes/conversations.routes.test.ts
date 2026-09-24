import { describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const routeMocks = vi.hoisted(() => ({
  requireRole: vi.fn((...roles: string[]) => {
    const middleware = (_request: unknown, _response: unknown, next: () => void) => next();
    Object.assign(middleware, { roles });
    return middleware;
  }),
  getConversationReplySuggestions: vi.fn((_request: unknown, response: { sendStatus: (status: number) => unknown }) => response.sendStatus(204)),
  updateBotEnabled: vi.fn(),
  bulkConversationActions: vi.fn(),
  listConversationPins: vi.fn(),
  pinConversationMessage: vi.fn(),
  unpinConversationMessage: vi.fn()
}));

vi.mock("../auth/auth.middleware.js", () => ({ requireRole: routeMocks.requireRole }));
vi.mock("../auth/workspace.middleware.js", () => ({
  resolveWorkspaceContext: (_request: unknown, _response: unknown, next: () => void) => next()
}));
vi.mock("../controllers/conversations.controller.js", () => ({
  listConversations: vi.fn(),
  markConversationRead: vi.fn(),
  bulkConversationActions: routeMocks.bulkConversationActions,
  updateAssignment: vi.fn(),
  updateBotEnabled: routeMocks.updateBotEnabled,
  updateStatus: vi.fn(),
  updateConversationTags: vi.fn(),
  getConversationReplySuggestions: routeMocks.getConversationReplySuggestions,
  createConversationNote: vi.fn(),
  deleteConversationNote: vi.fn(),
  listConversationNotes: vi.fn(),
  toggleConversationNotePin: vi.fn(),
  updateConversationNote: vi.fn()
}));
vi.mock("../controllers/messages.controller.js", () => ({ listMessages: vi.fn() }));
vi.mock("../controllers/conversation-pins.controller.js", () => ({
  listConversationPins: routeMocks.listConversationPins,
  pinConversationMessage: routeMocks.pinConversationMessage,
  unpinConversationMessage: routeMocks.unpinConversationMessage
}));

import { conversationRouter } from "./conversations.routes.js";

describe("conversation routes", () => {
  it("registers GET, POST, and DELETE pin routes for admins and agents", () => {
    const pinRoutes = conversationRouter.stack.filter((layer) =>
      typeof layer.route?.path === "string" && layer.route.path.includes("/pins")
    );

    expect(pinRoutes.map((layer) => ({
      method: Object.keys((layer.route as unknown as { methods?: Record<string, boolean> })?.methods ?? {})[0],
      path: layer.route?.path,
      roles: (layer.route?.stack[0]?.handle as { roles?: string[] } | undefined)?.roles,
      handler: layer.route?.stack.at(-1)?.handle
    }))).toEqual([
      {
        method: "get",
        path: "/:conversationId/pins",
        roles: ["admin", "agent", "customer"],
        handler: routeMocks.listConversationPins
      },
      {
        method: "post",
        path: "/:conversationId/pins",
        roles: ["admin", "agent", "customer"],
        handler: routeMocks.pinConversationMessage
      },
      {
        method: "delete",
        path: "/:conversationId/pins/:messageId",
        roles: ["admin", "agent", "customer"],
        handler: routeMocks.unpinConversationMessage
      }
    ]);
  });

  it("registers the note routes for admins and agents", () => {
    expect(conversationRouter.stack.some((layer) => layer.route?.path === "/:conversationId/notes")).toBe(true);
    expect(conversationRouter.stack.some((layer) => layer.route?.path === "/:conversationId/notes/:noteId/pin")).toBe(true);
    expect(routeMocks.requireRole).toHaveBeenCalledWith("admin", "agent", "customer");
  });

  it("registers the bot switch endpoint for admins and agents", () => {
    const route = conversationRouter.stack.find((layer) => layer.route?.path === "/:id/bot");

    expect(route?.route?.path).toBe("/:id/bot");
    expect(routeMocks.requireRole).toHaveBeenCalledWith("admin", "agent", "customer");
  });

  it("registers a protected bulk conversation action endpoint", () => {
    const route = conversationRouter.stack.find((layer) => layer.route?.path === "/bulk");
    expect(route?.route?.methods).toMatchObject({ post: true });
    expect(route?.route?.stack.at(-1)?.handle).toBe(routeMocks.bulkConversationActions);
  });

  it("registers the AI suggestions endpoint as POST and protects it for admins and agents", async () => {
    const route = conversationRouter.stack.find((layer) => layer.route?.path === "/:id/ai-suggestions");

    expect(route?.route?.path).toBe("/:id/ai-suggestions");
    expect(route?.route?.stack.at(-1)?.handle).toBe(routeMocks.getConversationReplySuggestions);
    expect(routeMocks.requireRole).toHaveBeenCalledWith("admin", "agent", "customer");

    const app = express();
    app.use(conversationRouter);

    await expect(request(app).post("/conversation-1/ai-suggestions")).resolves.toMatchObject({ status: 204 });
    await expect(request(app).get("/conversation-1/ai-suggestions")).resolves.toMatchObject({ status: 404 });
  });
});
