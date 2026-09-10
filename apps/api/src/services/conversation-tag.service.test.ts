import { describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  find: vi.fn(),
  create: vi.fn(),
  findByIdAndUpdate: vi.fn(),
  findByIdAndDelete: vi.fn()
}));
vi.mock("../models/conversation-tag.model.js", () => ({ ConversationTagModel: database }));

import {
  createConversationTag,
  deleteConversationTag,
  listConversationTags,
  updateConversationTag
} from "./conversation-tag.service.js";

function query<T>(value: T) {
  return { sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(value) }) };
}

describe("conversation tag service", () => {
  it("lists shared tags ordered by creation time", async () => {
    database.find.mockReturnValue(query([{ _id: "tag-1", name: "Mua hàng", color: "#22c55e" }]));

    await expect(listConversationTags()).resolves.toEqual({
      tags: [{ id: "tag-1", name: "Mua hàng", color: "#22c55e" }]
    });
    expect(database.find).toHaveBeenCalledWith({});
  });

  it("trims a new tag and stores a normalized name key", async () => {
    database.create.mockResolvedValue({ _id: "tag-1", name: "Mua hàng", color: "#22c55e" });

    await expect(createConversationTag({ name: "  Mua hàng ", color: "#22c55e" })).resolves.toEqual({
      id: "tag-1", name: "Mua hàng", color: "#22c55e"
    });
    expect(database.create).toHaveBeenCalledWith({ name: "Mua hàng", nameKey: "mua hàng", color: "#22c55e" });
  });

  it("updates only supplied fields and returns the updated tag", async () => {
    database.findByIdAndUpdate.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: "tag-1", name: "Đã gửi", color: "#0ea5e9" })
    });

    await expect(updateConversationTag("tag-1", { name: " Đã gửi " })).resolves.toEqual({
      id: "tag-1", name: "Đã gửi", color: "#0ea5e9"
    });
    expect(database.findByIdAndUpdate).toHaveBeenCalledWith(
      "tag-1", { $set: { name: "Đã gửi", nameKey: "đã gửi" } }, { new: true, runValidators: true }
    );
  });

  it("throws a not-found error when deleting a missing tag", async () => {
    database.findByIdAndDelete.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });

    await expect(deleteConversationTag("missing")).rejects.toMatchObject({
      statusCode: 404, code: "CONVERSATION_TAG_NOT_FOUND"
    });
  });
});
