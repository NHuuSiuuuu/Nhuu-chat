import { beforeEach, describe, expect, it, vi } from "vitest";

const models = vi.hoisted(() => ({
  conversations: { find: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn(), db: { transaction: vi.fn(async (callback: (session: string) => Promise<void>) => callback("session-1")) } },
  messages: { deleteMany: vi.fn() },
  notes: { deleteMany: vi.fn() },
  botProcessing: { deleteMany: vi.fn() }
}));

vi.mock("../models/conversation.model.js", () => ({ ConversationModel: models.conversations }));
vi.mock("../models/message.model.js", () => ({ MessageModel: models.messages }));
vi.mock("../models/conversation-note.model.js", () => ({ ConversationNoteModel: models.notes }));
vi.mock("../models/bot-processing.model.js", () => ({ BotProcessingModel: models.botProcessing }));

import { bulkConversationActions } from "./conversation.service.js";

const ids = ["507f1f77bcf86cd799439011"];
const auth = { id: "agent-1", role: "agent" } as never;

describe("bulk conversation actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    models.conversations.find.mockReturnValue({
      lean: vi.fn().mockResolvedValue([{ _id: ids[0], assignedAgentId: "agent-1", unreadCount: 3 }])
    });
    models.conversations.db.transaction.mockImplementation(async (callback: (session: string) => Promise<void>) => callback("session-1"));
  });

  it("marks the complete accessible batch unread", async () => {
    const updatedQuery = { populate: vi.fn(), sort: vi.fn(), lean: vi.fn().mockResolvedValue([{ _id: ids[0], customerId: "customer-1", assignedAgentId: "agent-1", unreadCount: 1, status: "open", lastMessageAt: new Date(), lastMessageSnippet: "Hi", platform: "telegram", channelId: "channel-1" }]) };
    updatedQuery.populate.mockReturnValue(updatedQuery);
    updatedQuery.sort.mockReturnValue(updatedQuery);
    models.conversations.find.mockReturnValueOnce({ lean: vi.fn().mockResolvedValue([{ _id: ids[0] }]) }).mockReturnValueOnce(updatedQuery);

    const result = await bulkConversationActions(ids, "unread", auth);

    expect(models.conversations.updateMany).toHaveBeenCalledWith(expect.objectContaining({ _id: { $in: ids }, assignedAgentId: "agent-1" }), { $set: { unreadCount: 1 } });
    expect(result.conversations).toMatchObject([{ id: ids[0], unreadCount: 1 }]);
  });

  it("refuses the entire batch before mutation if any conversation is inaccessible", async () => {
    models.conversations.find.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });
    await expect(bulkConversationActions(ids, "delete", auth)).rejects.toMatchObject({ code: "CONVERSATION_NOT_FOUND" });
    expect(models.messages.deleteMany).not.toHaveBeenCalled();
    expect(models.conversations.deleteMany).not.toHaveBeenCalled();
  });

  it("removes dependent records but preserves shared customer records", async () => {
    const result = await bulkConversationActions(ids, "delete", auth);
    expect(models.messages.deleteMany).toHaveBeenCalledWith({ conversationId: { $in: ids } }, { session: "session-1" });
    expect(models.notes.deleteMany).toHaveBeenCalledWith({ conversationId: { $in: ids } }, { session: "session-1" });
    expect(models.botProcessing.deleteMany).toHaveBeenCalledWith({ conversationId: { $in: ids } }, { session: "session-1" });
    expect(models.conversations.deleteMany).toHaveBeenCalledWith(expect.objectContaining({ _id: { $in: ids }, assignedAgentId: "agent-1" }), { session: "session-1" });
    expect(result.action).toBe("delete");
  });
});
