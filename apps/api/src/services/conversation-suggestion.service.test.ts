import { beforeEach, describe, expect, it, vi } from "vitest";

const conversationModelMocks = vi.hoisted(() => ({
  findOne: vi.fn()
}));

const messageModelMocks = vi.hoisted(() => ({
  findOne: vi.fn()
}));

const providerMocks = vi.hoisted(() => ({
  constructor: vi.fn(),
  suggest: vi.fn()
}));

vi.mock("../models/conversation.model.js", () => ({ ConversationModel: conversationModelMocks }));
vi.mock("../models/message.model.js", () => ({ MessageModel: messageModelMocks }));
vi.mock("../ai/reply-suggestion.provider.js", () => ({
  GeminiReplySuggestionProvider: vi.fn(() => {
    providerMocks.constructor();
    return { suggest: providerMocks.suggest };
  })
}));

import { getConversationReplySuggestions } from "./conversation.service.js";

const adminAuth = { id: "admin-1", email: "admin@example.com", role: "admin" } as const;

function resolvedQuery<T>(value: T) {
  return { lean: vi.fn().mockResolvedValue(value) };
}

function messageQuery<T>(value: T) {
  const query = {
    sort: vi.fn(),
    lean: vi.fn().mockResolvedValue(value)
  };
  query.sort.mockReturnValue(query);
  return query;
}

describe("getConversationReplySuggestions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    conversationModelMocks.findOne.mockReturnValue(resolvedQuery({ _id: "conversation-1" }));
    messageModelMocks.findOne.mockReturnValue(messageQuery({ content: "Tôi muốn hỏi về đơn hàng" }));
    providerMocks.suggest.mockResolvedValue(["Gợi ý 1", "Gợi ý 2", "Gợi ý 3"]);
  });

  it("uses the newest customer message after checking conversation access", async () => {
    const result = await getConversationReplySuggestions("conversation-1", adminAuth);

    expect(conversationModelMocks.findOne).toHaveBeenCalledWith({ _id: "conversation-1" });
    expect(messageModelMocks.findOne).toHaveBeenCalledWith({
      conversationId: "conversation-1",
      senderType: "customer"
    });
    expect(messageModelMocks.findOne().sort).toHaveBeenCalledWith({ createdAt: -1, _id: -1 });
    expect(providerMocks.suggest).toHaveBeenCalledWith({ latestCustomerMessage: "Tôi muốn hỏi về đơn hàng" });
    expect(result).toEqual({ suggestions: ["Gợi ý 1", "Gợi ý 2", "Gợi ý 3"], source: "gemini" });
  });

  it("does not look up messages for a conversation outside an agent's assignment", async () => {
    conversationModelMocks.findOne.mockReturnValue(resolvedQuery(null));

    await expect(getConversationReplySuggestions("conversation-1", {
      id: "agent-1",
      email: "agent@example.com",
      role: "agent"
    })).rejects.toMatchObject({ statusCode: 404, code: "CONVERSATION_NOT_FOUND" });

    expect(conversationModelMocks.findOne).toHaveBeenCalledWith({
      _id: "conversation-1",
      assignedAgentId: "agent-1"
    });
    expect(messageModelMocks.findOne).not.toHaveBeenCalled();
  });

  it("returns local fallback when Gemini is unavailable", async () => {
    providerMocks.suggest.mockRejectedValue(new Error("GEMINI_API_KEY is not configured"));

    const result = await getConversationReplySuggestions("conversation-1", adminAuth);

    expect(result.source).toBe("fallback");
    expect(result.suggestions).toHaveLength(3);
  });

  it("builds different fallback suggestions from different latest customer messages", async () => {
    providerMocks.suggest.mockRejectedValue(new Error("GEMINI_API_KEY is not configured"));

    const orderResult = await getConversationReplySuggestions("conversation-1", adminAuth);

    messageModelMocks.findOne.mockReturnValue(messageQuery({ content: "Tôi muốn đổi địa chỉ nhận hàng" }));
    const addressResult = await getConversationReplySuggestions("conversation-1", adminAuth);

    expect(orderResult.source).toBe("fallback");
    expect(addressResult.source).toBe("fallback");
    expect(orderResult.suggestions).toHaveLength(3);
    expect(addressResult.suggestions).toHaveLength(3);
    expect(addressResult.suggestions).not.toEqual(orderResult.suggestions);
  });

  it("returns local fallback when no customer message is available", async () => {
    messageModelMocks.findOne.mockReturnValue(messageQuery(null));

    const result = await getConversationReplySuggestions("conversation-1", adminAuth);

    expect(result.source).toBe("fallback");
    expect(result.suggestions).toHaveLength(3);
    expect(providerMocks.suggest).not.toHaveBeenCalled();
  });

  it("returns local fallback when Gemini configuration fails during provider creation", async () => {
    providerMocks.constructor.mockImplementation(() => {
      throw new Error("GEMINI_API_KEY is not configured");
    });

    const result = await getConversationReplySuggestions("conversation-1", adminAuth);

    expect(result.source).toBe("fallback");
    expect(result.suggestions).toHaveLength(3);
  });
});
