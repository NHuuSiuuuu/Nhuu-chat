import express, { type ErrorRequestHandler } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({
  listConversationTags: vi.fn(),
  createConversationTag: vi.fn(),
  updateConversationTag: vi.fn(),
  deleteConversationTag: vi.fn()
}));
vi.mock("../services/conversation-tag.service.js", () => service);

import { errorHandler } from "../common/errors.js";
import {
  createConversationTag,
  deleteConversationTag,
  listConversationTags,
  updateConversationTag
} from "./conversation-tags.controller.js";

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.get("/tags", listConversationTags);
  app.post("/tags", createConversationTag);
  app.patch("/tags/:id", updateConversationTag);
  app.delete("/tags/:id", deleteConversationTag);
  const captureError: ErrorRequestHandler = (error, req, res, next) => errorHandler(error, req, res, next);
  app.use(captureError);
  return app;
}

describe("conversation tag controller", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns the shared tag list", async () => {
    service.listConversationTags.mockResolvedValue({ tags: [{ id: "tag-1", name: "Mua hàng", color: "#22c55e" }] });

    const response = await request(createTestApp()).get("/tags");

    expect(response.status).toBe(200);
    expect(response.body.tags).toHaveLength(1);
  });

  it("rejects invalid create input before calling the service", async () => {
    const response = await request(createTestApp()).post("/tags").send({ name: "", color: "red" });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_REQUEST");
    expect(service.createConversationTag).not.toHaveBeenCalled();
  });

  it("creates, updates, and deletes a tag", async () => {
    service.createConversationTag.mockResolvedValue({ id: "tag-1", name: "Mua hàng", color: "#22c55e" });
    service.updateConversationTag.mockResolvedValue({ id: "tag-1", name: "Đã gửi", color: "#22c55e" });
    service.deleteConversationTag.mockResolvedValue(undefined);

    const app = createTestApp();
    expect((await request(app).post("/tags").send({ name: "Mua hàng", color: "#22c55e" })).status).toBe(201);
    expect((await request(app).patch("/tags/tag-1").send({ name: "Đã gửi" })).status).toBe(200);
    expect((await request(app).delete("/tags/tag-1")).status).toBe(204);
    expect(service.deleteConversationTag).toHaveBeenCalledWith("tag-1");
  });
});
