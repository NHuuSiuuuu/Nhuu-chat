import { beforeEach, describe, expect, it, vi } from "vitest";

const conversationModelMocks = vi.hoisted(() => ({
  find: vi.fn(),
  countDocuments: vi.fn()
}));

vi.mock("../models/conversation.model.js", () => ({
  ConversationModel: conversationModelMocks
}));

import { listConversations } from "./conversation.service.js";

describe("conversation list filters", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    const query = {
      populate: vi.fn(),
      sort: vi.fn(),
      skip: vi.fn(),
      limit: vi.fn(),
      lean: vi.fn().mockResolvedValue([])
    };
    query.populate.mockReturnValue(query);
    query.sort.mockReturnValue(query);
    query.skip.mockReturnValue(query);
    query.limit.mockReturnValue(query);
    conversationModelMocks.find.mockReturnValue(query);
    conversationModelMocks.countDocuments.mockResolvedValue(0);
  });

  it("filters Facebook conversations by the selected Page ID", async () => {
    await listConversations({
      platform: "facebook",
      channelId: "page-42"
    });

    expect(conversationModelMocks.find).toHaveBeenCalledWith({
      platform: "facebook",
      channelId: "page-42"
    });
    expect(conversationModelMocks.countDocuments).toHaveBeenCalledWith({
      platform: "facebook",
      channelId: "page-42"
    });
  });
});
