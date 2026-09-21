import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({
  createPost: vi.fn(), listPosts: vi.fn(), updatePost: vi.fn(), retryPost: vi.fn(), cancelPost: vi.fn()
}));

vi.mock("../services/facebook-post.service.js", () => ({ facebookPostService: service }));
vi.mock("../services/auth.service.js", () => ({ verifyAccessToken: async () => ({ id: "user-1", role: "agent" }) }));

import { errorHandler } from "../common/errors.js";
import { facebookPostRouter } from "./facebook-post.routes.js";

function app() {
  const instance = express();
  instance.use("/api/v1/facebook-page/posts", facebookPostRouter);
  instance.use(errorHandler);
  return instance;
}

describe("Facebook post multipart routes", () => {
  it("requires authentication before accepting a multipart post", async () => {
    const response = await request(app()).post("/api/v1/facebook-page/posts").field("message", "Hello").field("mode", "draft");

    expect(response.status).toBe(401);
    expect(service.createPost).not.toHaveBeenCalled();
  });

  it.each([
    ["image/gif", Buffer.from("gif")],
    ["image/jpeg", Buffer.alloc(5 * 1024 * 1024 + 1)]
  ] as const)("rejects invalid image MIME or size (%s)", async (mimeType, content) => {
    const response = await request(app()).post("/api/v1/facebook-page/posts")
      .set("Authorization", "Bearer agent-token")
      .field("message", "Hello")
      .field("mode", "draft")
      .attach("image", content, { filename: "post.jpg", contentType: mimeType });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_ATTACHMENT");
    expect(service.createPost).not.toHaveBeenCalled();
  });
});
