import mongoose from "mongoose";
import { describe, expect, it } from "vitest";

import { FacebookPostModel } from "./facebook-post.model.js";

describe("Facebook post model", () => {
  it("rejects an unknown post status", async () => {
    const post = new FacebookPostModel({
      userId: new mongoose.Types.ObjectId(),
      connectionId: new mongoose.Types.ObjectId(),
      pageId: "page-123",
      message: "A post",
      status: "unknown"
    });

    await expect(post.validate()).rejects.toMatchObject({
      errors: { status: expect.anything() }
    });
  });

  it("defines scheduler and lease recovery indexes", () => {
    const indexes = FacebookPostModel.schema.indexes();

    expect(indexes.map(([fields]) => fields)).toEqual(expect.arrayContaining([
      { status: 1, scheduledAt: 1 },
      { status: 1, publishingLeaseUntil: 1 }
    ]));
  });

  it("defaults new posts to draft in the Vietnam timezone", () => {
    const post = new FacebookPostModel({
      userId: new mongoose.Types.ObjectId(),
      connectionId: new mongoose.Types.ObjectId(),
      pageId: "page-123",
      message: "A post"
    });

    expect(post.status).toBe("draft");
    expect(post.timezone).toBe("Asia/Ho_Chi_Minh");
    expect(post.attempts).toBe(0);
  });
});
