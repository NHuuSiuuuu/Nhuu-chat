import { beforeEach, describe, expect, it, vi } from "vitest";

const conversationModelMocks = vi.hoisted(() => ({
  findOne: vi.fn()
}));

const messageModelMocks = vi.hoisted(() => ({
  find: vi.fn()
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
    limit: vi.fn(),
    lean: vi.fn().mockResolvedValue(value)
  };
  query.sort.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  return query;
}

describe("getConversationReplySuggestions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    conversationModelMocks.findOne.mockReturnValue(resolvedQuery({ _id: "conversation-1" }));
    messageModelMocks.find.mockReturnValue(messageQuery([
      { senderType: "customer", content: "Tôi muốn hỏi về đơn hàng" },
      { senderType: "agent", content: "Dạ, em hỗ trợ anh/chị ạ." }
    ]));
    providerMocks.suggest.mockResolvedValue(["Gợi ý 1", "Gợi ý 2", "Gợi ý 3"]);
  });

  it("uses the six newest messages with sender labels and chronological order", async () => {
    const result = await getConversationReplySuggestions("conversation-1", adminAuth);

    expect(conversationModelMocks.findOne).toHaveBeenCalledWith({ _id: "conversation-1" });
    expect(messageModelMocks.find).toHaveBeenCalledWith({ conversationId: "conversation-1" });
    expect(messageModelMocks.find().sort).toHaveBeenCalledWith({ createdAt: -1, _id: -1 });
    expect(messageModelMocks.find().limit).toHaveBeenCalledWith(6);
    expect(providerMocks.suggest).toHaveBeenCalledWith({
      conversationContext: "Nhân viên: Dạ, em hỗ trợ anh/chị ạ.\nKhách hàng: Tôi muốn hỏi về đơn hàng"
    });
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
    expect(messageModelMocks.find).not.toHaveBeenCalled();
  });

  it("returns an empty fallback when Gemini is unavailable", async () => {
    providerMocks.suggest.mockRejectedValue(new Error("GEMINI_API_KEY is not configured"));

    const result = await getConversationReplySuggestions("conversation-1", adminAuth);

    expect(result.source).toBe("fallback");
    expect(result.suggestions).toEqual([]);
  });

  it("returns an empty fallback when no customer message is available", async () => {
    messageModelMocks.find.mockReturnValue(messageQuery([]));

    const result = await getConversationReplySuggestions("conversation-1", adminAuth);

    expect(result.source).toBe("fallback");
    expect(result.suggestions).toEqual([]);
    expect(providerMocks.suggest).not.toHaveBeenCalled();
  });

  it("returns an empty fallback when Gemini configuration fails during provider creation", async () => {
    providerMocks.constructor.mockImplementation(() => {
      throw new Error("GEMINI_API_KEY is not configured");
    });

    const result = await getConversationReplySuggestions("conversation-1", adminAuth);

    expect(result.source).toBe("fallback");
    expect(result.suggestions).toEqual([]);
  });
});
