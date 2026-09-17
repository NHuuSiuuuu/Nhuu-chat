import express, { type ErrorRequestHandler } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const controller = vi.hoisted(() => ({ sendMessage: vi.fn() }));
const auth = vi.hoisted(() => ({ verifyAccessToken: vi.fn() }));

vi.mock("../controllers/messages.controller.js", () => controller);
vi.mock("../services/auth.service.js", () => auth);

import { errorHandler } from "../common/errors.js";
import { messageRouter } from "./messages.routes.js";

function createTestApp() {
  const app = express();
  app.use("/api/v1/messages", messageRouter);
  const captureError: ErrorRequestHandler = (error, req, res, next) => errorHandler(error, req, res, next);
  app.use(captureError);
  return app;
}

describe("message upload route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    auth.verifyAccessToken.mockResolvedValue({ id: "agent-1", email: "agent@example.com", role: "agent" });
    controller.sendMessage.mockImplementation(async (req, res) => res.status(201).json({ id: "message-1" }));
  });

  it("accepts the three message fields and one image attachment", async () => {
    const response = await request(createTestApp())
      .post("/api/v1/messages/send")
      .set("Authorization", "Bearer agent-token")
      .field("conversationId", "507f1f77bcf86cd799439011")
      .field("type", "image")
      .field("content", "hi")
      .attach("attachment", Buffer.from("image"), {
        filename: "photo.png",
        contentType: "image/png"
      });

    expect(response.status).toBe(201);
    expect(controller.sendMessage).toHaveBeenCalled();
  });

  it.each([
    ["dangerous extension", "script.exe", "application/octet-stream", Buffer.from("binary")],
    ["oversized file", "large.png", "image/png", Buffer.alloc(20 * 1024 * 1024 + 1)]
  ])("rejects an attachment with %s", async (_label, filename, contentType, content) => {
    const response = await request(createTestApp())
      .post("/api/v1/messages/send")
      .set("Authorization", "Bearer agent-token")
      .field("conversationId", "507f1f77bcf86cd799439011")
      .field("type", "file")
      .field("content", "hi")
      .attach("attachment", content, { filename, contentType });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_ATTACHMENT");
    expect(controller.sendMessage).not.toHaveBeenCalled();
  });
});
