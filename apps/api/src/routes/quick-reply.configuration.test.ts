import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const model = vi.hoisted(() => ({ create: vi.fn(), exists: vi.fn(), findOneAndUpdate: vi.fn() }));
vi.mock("../models/quick-reply.model.js", () => ({ QuickReplyModel: model }));
vi.mock("@nhuu-chat/config", () => ({ env: {
  CLOUDINARY_CLOUD_NAME: "private-cloud",
  CLOUDINARY_API_KEY: "private-key"
} }));
vi.mock("../services/auth.service.js", () => ({
  verifyAccessToken: async () => ({ id: "507f1f77bcf86cd799439011", role: "agent" })
}));

import { errorHandler } from "../common/errors.js";
import { quickReplyRouter } from "./quick-reply.routes.js";

describe("quick reply API without Cloudinary configuration", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    model.exists.mockResolvedValue({ _id: "507f1f77bcf86cd799439012" });
  });

  it.each(["post", "patch"] as const)("exposes a safe configuration error through %s without persisting", async (method) => {
    const app = express();
    app.use("/api/v1/quick-replies", quickReplyRouter);
    app.use(errorHandler);
    const response = await request(app)[method](method === "post" ? "/api/v1/quick-replies" : "/api/v1/quick-replies/507f1f77bcf86cd799439012")
      .set("Authorization", "Bearer agent-token")
      .field("shortcut", "welcome")
      .field("message", "Welcome")
      .attach("attachment", Buffer.from("image"), "image.png");

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: {
      code: "CLOUDINARY_NOT_CONFIGURED",
      message: "Cloudinary is not configured"
    } });
    expect(model.create).not.toHaveBeenCalled();
    expect(model.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("still permits text-only replies without Cloudinary", async () => {
    model.create.mockResolvedValue({ _id: "reply-1", shortcut: "welcome", message: "Welcome" });
    const app = express();
    app.use("/api/v1/quick-replies", quickReplyRouter);
    app.use(errorHandler);
    const response = await request(app).post("/api/v1/quick-replies")
      .set("Authorization", "Bearer agent-token")
      .field("shortcut", "welcome").field("message", "Welcome");
    expect(response.status).toBe(201);
    expect(response.body).toEqual({ id: "reply-1", shortcut: "welcome", message: "Welcome" });
  });
});
