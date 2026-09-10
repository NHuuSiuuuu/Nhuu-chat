import { describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  requireRole: vi.fn((_adminRole: string, _agentRole: string) => (_request: unknown, _response: unknown, next: () => void) => next()),
  getConversationReplySuggestions: vi.fn()
}));

vi.mock("../auth/auth.middleware.js", () => ({ requireRole: routeMocks.requireRole }));
vi.mock("../controllers/conversations.controller.js", () => ({
  listConversations: vi.fn(),
  markConversationRead: vi.fn(),
  updateAssignment: vi.fn(),
  updateStatus: vi.fn(),
  updateConversationTags: vi.fn(),
  getConversationReplySuggestions: routeMocks.getConversationReplySuggestions
}));
vi.mock("../controllers/messages.controller.js", () => ({ listMessages: vi.fn() }));

import { conversationRouter } from "./conversations.routes.js";

describe("conversation suggestions route", () => {
  it("protects the AI suggestions endpoint for admins and agents", () => {
    const route = conversationRouter.stack.find((layer) => layer.route?.path === "/:id/ai-suggestions");

    expect(route?.route?.methods.post).toBe(true);
    expect(route?.route?.stack.at(-1)?.handle).toBe(routeMocks.getConversationReplySuggestions);
    expect(routeMocks.requireRole).toHaveBeenCalledWith("admin", "agent");
  });
});
