import { beforeEach, describe, expect, it, vi } from "vitest";

const conversationModel = vi.hoisted(() => ({
  findOneAndUpdate: vi.fn()
}));
const conversationTagModel = vi.hoisted(() => ({
  countDocuments: vi.fn()
}));

vi.mock("../models/conversation.model.js", () => ({ ConversationModel: conversationModel }));
vi.mock("../models/conversation-tag.model.js", () => ({ ConversationTagModel: conversationTagModel }));

import { AppError } from "../common/errors.js";
import { updateConversationTags } from "./conversation.service.js";

const admin = { id: "admin-1", email: "admin@example.com", role: "admin" } as const;
const agent = { id: "agent-1", email: "agent@example.com", role: "agent" } as const;

function updatedConversation() {
  return {
    _id: "conversation-1",
    customerId: { _id: "customer-1", name: "Khách", avatarUrl: "" },
    platform: "zalo",
    channelId: "channel-1",
    assignedAgentId: "agent-1",
    unreadCount: 0,
    status: "open",
    lastMessageAt: "2026-09-10T10:00:00.000Z",
    lastMessageSnippet: "Xin chào",
    tagIds: [{ _id: "507f1f77bcf86cd799439011", name: "Mua hàng", color: "#22c55e" }]
  };
}

describe("conversation tag attachment", () => {
  beforeEach(() => vi.resetAllMocks());

  it("replaces tags for an authorized admin and removes duplicate ids", async () => {
    conversationTagModel.countDocuments.mockResolvedValue(1);
    const lean = vi.fn().mockResolvedValue(updatedConversation());
    const populateTags = vi.fn().mockReturnValue({ lean });
    const populateCustomer = vi.fn().mockReturnValue({ populate: populateTags });
    conversationModel.findOneAndUpdate.mockReturnValue({ populate: populateCustomer });

    await expect(updateConversationTags("conversation-1", ["507f1f77bcf86cd799439011", "507f1f77bcf86cd799439011"], admin)).resolves.toMatchObject({
      tags: [{ id: "507f1f77bcf86cd799439011", name: "Mua hàng", color: "#22c55e" }]
    });
    expect(conversationTagModel.countDocuments).toHaveBeenCalledWith({ _id: { $in: ["507f1f77bcf86cd799439011"] } });
    expect(conversationModel.findOneAndUpdate).toHaveBeenCalledWith({ _id: "conversation-1" }, { $set: { tagIds: ["507f1f77bcf86cd799439011"] } }, { new: true });
  });

  it("rejects a tag id that does not exist", async () => {
    conversationTagModel.countDocuments.mockResolvedValue(0);

    await expect(updateConversationTags("conversation-1", ["507f1f77bcf86cd799439011"], admin)).rejects.toMatchObject({
      statusCode: 400,
      code: "CONVERSATION_TAG_NOT_FOUND"
    });
    expect(conversationModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("scopes agent updates to assigned conversations", async () => {
    conversationTagModel.countDocuments.mockResolvedValue(1);
    const lean = vi.fn().mockResolvedValue(null);
    const populateTags = vi.fn().mockReturnValue({ lean });
    const populateCustomer = vi.fn().mockReturnValue({ populate: populateTags });
    conversationModel.findOneAndUpdate.mockReturnValue({ populate: populateCustomer });

    await expect(updateConversationTags("conversation-1", ["507f1f77bcf86cd799439011"], agent)).rejects.toMatchObject({
      statusCode: 404,
      code: "CONVERSATION_NOT_FOUND"
    });
    expect(conversationModel.findOneAndUpdate).toHaveBeenCalledWith({ _id: "conversation-1", assignedAgentId: "agent-1" }, expect.anything(), { new: true });
  });
});
