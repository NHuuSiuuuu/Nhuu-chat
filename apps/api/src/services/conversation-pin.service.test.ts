import { beforeEach, describe, expect, it, vi } from "vitest";

const conversationModel = vi.hoisted(() => ({
  findOne: vi.fn(),
  findOneAndUpdate: vi.fn()
}));

const messageModel = vi.hoisted(() => ({
  findOne: vi.fn(),
  find: vi.fn()
}));

vi.mock("../models/conversation.model.js", () => ({ ConversationModel: conversationModel }));
vi.mock("../models/message.model.js", () => ({ MessageModel: messageModel }));

import {
  listConversationPins,
  pinConversationMessage,
  unpinConversationMessage
} from "./conversation-pin.service.js";

const adminAuth = { id: "admin-1", email: "admin@example.com", role: "admin" } as const;
const agentAuth = { id: "agent-1", email: "agent@example.com", role: "agent" } as const;
const olderPin = {
  messageId: "message-1",
  pinnedBy: "admin-1",
  pinnedAt: new Date("2026-09-17T08:00:00.000Z")
};
const newerPin = {
  messageId: "message-2",
  pinnedBy: "agent-1",
  pinnedAt: new Date("2026-09-17T09:00:00.000Z")
};

function resolvedQuery<T>(value: T) {
  return { lean: vi.fn().mockResolvedValue(value) };
}

function conversation(pinnedMessages: Array<typeof olderPin> = []) {
  return { _id: "conversation-1", pinnedMessages };
}

function message(
  id: string,
  content: string,
  createdAt: string,
  metadata: Record<string, unknown> = {}
) {
  return {
    _id: id,
    conversationId: "conversation-1",
    content,
    type: "text",
    metadata,
    createdAt: new Date(createdAt)
  };
}

describe("conversation pin service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    conversationModel.findOne.mockReturnValue(resolvedQuery(conversation()));
    messageModel.find.mockReturnValue(resolvedQuery([]));
  });

  it("pins a message from the same conversation and returns its quote", async () => {
    messageModel.findOne.mockReturnValue(resolvedQuery(message(
      "message-1",
      "Tin cần ghim",
      "2026-09-17T07:30:00.000Z",
      { senderName: "Nguyễn Văn Hữu" }
    )));
    conversationModel.findOneAndUpdate.mockImplementation((_filter, update) => resolvedQuery(
      conversation([update.$push.pinnedMessages])
    ));
    messageModel.find.mockReturnValue(resolvedQuery([
      message("message-1", "Tin cần ghim", "2026-09-17T07:30:00.000Z", {
        senderName: "Nguyễn Văn Hữu"
      })
    ]));

    const result = await pinConversationMessage("conversation-1", "message-1", adminAuth);

    expect(result.pinnedMessages).toEqual([{
      messageId: "message-1",
      content: "Tin cần ghim",
      type: "text",
      senderName: "Nguyễn Văn Hữu",
      createdAt: "2026-09-17T07:30:00.000Z",
      pinnedBy: "admin-1",
      pinnedAt: expect.any(String)
    }]);
    expect(messageModel.findOne).toHaveBeenCalledWith({
      _id: "message-1",
      conversationId: "conversation-1"
    });
    expect(conversationModel.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: "conversation-1",
        $or: [
          { platform: { $ne: "zalo_personal" } },
          { ownerId: "admin-1" },
          { assignedAgentId: "admin-1" }
        ],
        "pinnedMessages.messageId": { $ne: "message-1" },
        $expr: {
          $lt: [
            { $size: { $ifNull: ["$pinnedMessages", []] } },
            10
          ]
        }
      },
      { $push: { pinnedMessages: {
        messageId: "message-1",
        pinnedBy: "admin-1",
        pinnedAt: expect.any(Date)
      } } },
      { new: true }
    );
  });

  it("rejects a message belonging to another conversation", async () => {
    messageModel.findOne.mockReturnValue(resolvedQuery(null));

    await expect(
      pinConversationMessage("conversation-1", "message-2", adminAuth)
    ).rejects.toMatchObject({ statusCode: 404, code: "MESSAGE_NOT_FOUND" });

    expect(messageModel.findOne).toHaveBeenCalledWith({
      _id: "message-2",
      conversationId: "conversation-1"
    });
    expect(conversationModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("rejects the eleventh distinct pin", async () => {
    const tenPins = Array.from({ length: 10 }, (_, index) => ({
      messageId: `message-${index + 1}`,
      pinnedBy: "admin-1",
      pinnedAt: new Date(`2026-09-17T0${index}:00:00.000Z`)
    }));
    conversationModel.findOne.mockReturnValue(resolvedQuery(conversation(tenPins)));
    messageModel.findOne.mockReturnValue(resolvedQuery(message(
      "message-11",
      "Tin thứ mười một",
      "2026-09-17T10:00:00.000Z"
    )));

    await expect(
      pinConversationMessage("conversation-1", "message-11", adminAuth)
    ).rejects.toMatchObject({ statusCode: 409, code: "CONVERSATION_PIN_LIMIT_REACHED" });

    expect(conversationModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("removes only the requested pin", async () => {
    conversationModel.findOne.mockReturnValue(resolvedQuery(conversation([olderPin, newerPin])));
    conversationModel.findOneAndUpdate.mockReturnValue(resolvedQuery(conversation([newerPin])));
    messageModel.find.mockReturnValue(resolvedQuery([
      message("message-2", "Tin còn lại", "2026-09-17T08:30:00.000Z")
    ]));

    const result = await unpinConversationMessage("conversation-1", "message-1", adminAuth);

    expect(result.pinnedMessages).toEqual([expect.objectContaining({
      messageId: "message-2",
      content: "Tin còn lại"
    })]);
    expect(conversationModel.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: "conversation-1",
        $or: [
          { platform: { $ne: "zalo_personal" } },
          { ownerId: "admin-1" },
          { assignedAgentId: "admin-1" }
        ]
      },
      { $pull: { pinnedMessages: { messageId: "message-1" } } },
      { new: true }
    );
  });

  it("returns the canonical list without growing a duplicate pin", async () => {
    conversationModel.findOne.mockReturnValue(resolvedQuery(conversation([olderPin])));
    messageModel.findOne.mockReturnValue(resolvedQuery(message(
      "message-1",
      "Tin đã ghim",
      "2026-09-17T07:30:00.000Z"
    )));
    messageModel.find.mockReturnValue(resolvedQuery([
      message("message-1", "Tin đã ghim", "2026-09-17T07:30:00.000Z")
    ]));

    const result = await pinConversationMessage("conversation-1", "message-1", adminAuth);

    expect(result.pinnedMessages).toHaveLength(1);
    expect(result.pinnedMessages[0]?.messageId).toBe("message-1");
    expect(conversationModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("returns one canonical pin when a concurrent request already pinned the message", async () => {
    conversationModel.findOne
      .mockReturnValueOnce(resolvedQuery(conversation()))
      .mockReturnValueOnce(resolvedQuery(conversation([olderPin])));
    messageModel.findOne.mockReturnValue(resolvedQuery(message(
      "message-1",
      "Tin được request khác ghim trước",
      "2026-09-17T07:30:00.000Z"
    )));
    conversationModel.findOneAndUpdate.mockReturnValue(resolvedQuery(null));
    messageModel.find.mockReturnValue(resolvedQuery([
      message(
        "message-1",
        "Tin được request khác ghim trước",
        "2026-09-17T07:30:00.000Z"
      )
    ]));

    const result = await pinConversationMessage("conversation-1", "message-1", adminAuth);

    expect(result.pinnedMessages).toHaveLength(1);
    expect(result.pinnedMessages[0]?.messageId).toBe("message-1");
    expect(conversationModel.findOne).toHaveBeenCalledTimes(2);
  });

  it("rejects a concurrent eleventh pin when the conditional update no longer matches", async () => {
    const ninePins = Array.from({ length: 9 }, (_, index) => ({
      messageId: `message-${index + 1}`,
      pinnedBy: "admin-1",
      pinnedAt: new Date(`2026-09-17T0${index}:00:00.000Z`)
    }));
    const tenthPin = {
      messageId: "message-10",
      pinnedBy: "agent-1",
      pinnedAt: new Date("2026-09-17T09:00:00.000Z")
    };
    conversationModel.findOne
      .mockReturnValueOnce(resolvedQuery(conversation(ninePins)))
      .mockReturnValueOnce(resolvedQuery(conversation([...ninePins, tenthPin])));
    messageModel.findOne.mockReturnValue(resolvedQuery(message(
      "message-11",
      "Tin cạnh tranh thứ mười một",
      "2026-09-17T10:00:00.000Z"
    )));
    conversationModel.findOneAndUpdate.mockReturnValue(resolvedQuery(null));

    await expect(
      pinConversationMessage("conversation-1", "message-11", adminAuth)
    ).rejects.toMatchObject({ statusCode: 409, code: "CONVERSATION_PIN_LIMIT_REACHED" });

    expect(conversationModel.findOne).toHaveBeenCalledTimes(2);
    expect(messageModel.find).not.toHaveBeenCalled();
  });

  it("reports a pin conflict when the failed conditional update is neither duplicate nor full", async () => {
    conversationModel.findOne
      .mockReturnValueOnce(resolvedQuery(conversation()))
      .mockReturnValueOnce(resolvedQuery(conversation()));
    messageModel.findOne.mockReturnValue(resolvedQuery(message(
      "message-1",
      "Tin gặp tranh chấp",
      "2026-09-17T07:30:00.000Z"
    )));
    conversationModel.findOneAndUpdate.mockReturnValue(resolvedQuery(null));

    await expect(
      pinConversationMessage("conversation-1", "message-1", adminAuth)
    ).rejects.toMatchObject({ statusCode: 409, code: "CONVERSATION_PIN_CONFLICT" });

    expect(conversationModel.findOne).toHaveBeenCalledTimes(2);
  });

  it("rejects access to a conversation outside the agent assignment", async () => {
    conversationModel.findOne.mockReturnValue(resolvedQuery(null));

    await expect(
      listConversationPins("conversation-1", agentAuth)
    ).rejects.toMatchObject({ statusCode: 404, code: "CONVERSATION_NOT_FOUND" });

    expect(conversationModel.findOne).toHaveBeenCalledWith({
      _id: "conversation-1",
      assignedAgentId: "agent-1"
    });
    expect(messageModel.find).not.toHaveBeenCalled();
  });

  it("returns newest pins first and filters stale message references", async () => {
    conversationModel.findOne.mockReturnValue(resolvedQuery(conversation([olderPin, newerPin, {
      messageId: "stale-message",
      pinnedBy: "admin-1",
      pinnedAt: new Date("2026-09-17T10:00:00.000Z")
    }])));
    messageModel.find.mockReturnValue(resolvedQuery([
      message("message-1", "Tin cũ", "2026-09-17T07:30:00.000Z"),
      message("message-2", "Tin mới", "2026-09-17T08:30:00.000Z")
    ]));

    const result = await listConversationPins("conversation-1", adminAuth);

    expect(result.pinnedMessages.map((item) => item.messageId)).toEqual([
      "message-2",
      "message-1"
    ]);
    expect(messageModel.find).toHaveBeenCalledWith({
      _id: { $in: ["message-1", "message-2", "stale-message"] },
      conversationId: "conversation-1"
    });
  });
});
