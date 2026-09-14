import express, { type ErrorRequestHandler } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({
  listQuickReplies: vi.fn(),
  createQuickReply: vi.fn(),
  updateQuickReply: vi.fn(),
  deleteQuickReply: vi.fn()
}));
const auth = vi.hoisted(() => ({ verifyAccessToken: vi.fn() }));

vi.mock("../services/quick-reply.service.js", () => service);
vi.mock("../services/auth.service.js", () => auth);

import { errorHandler } from "../common/errors.js";
import { quickReplyRouter } from "../routes/quick-reply.routes.js";

function createTestApp() {
  const app = express();
  app.use("/api/v1/quick-replies", quickReplyRouter);
  const captureError: ErrorRequestHandler = (error, req, res, next) => {
    errorHandler(error, req, res, next);
  };
  app.use(captureError);
  return app;
}

describe("quick reply controller and routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    auth.verifyAccessToken.mockImplementation(async (token: string) => {
      if (token === "admin-token") {
        return { id: "admin-1", email: "admin@example.com", role: "admin" };
      }
      if (token === "agent-token") {
        return { id: "agent-1", email: "agent@example.com", role: "agent" };
      }
      if (token === "customer-token") {
        return { id: "customer-1", email: "customer@example.com", role: "customer" };
      }
      throw new Error("invalid token");
    });
  });

  it("rejects unauthenticated and customer access before calling the service", async () => {
    const app = createTestApp();

    const unauthenticated = await request(app).get("/api/v1/quick-replies");
    const forbidden = await request(app)
      .get("/api/v1/quick-replies")
      .set("Authorization", "Bearer customer-token");

    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.body.error.code).toBe("AUTHENTICATION_REQUIRED");
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe("FORBIDDEN");
    expect(service.listQuickReplies).not.toHaveBeenCalled();
  });

  it.each([
    ["admin-token", "admin-1"],
    ["agent-token", "agent-1"]
  ])("lists replies for an authenticated admin or agent", async (token, expectedUserId) => {
    service.listQuickReplies.mockResolvedValue({ quickReplies: [] });

    const response = await request(createTestApp())
      .get("/api/v1/quick-replies")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ quickReplies: [] });
    expect(service.listQuickReplies).toHaveBeenCalledWith(expectedUserId);
  });

  it("creates a reply from multipart fields and an in-memory image", async () => {
    service.createQuickReply.mockResolvedValue({
      id: "reply-1",
      shortcut: "welcome",
      message: "Welcome"
    });

    const response = await request(createTestApp())
      .post("/api/v1/quick-replies")
      .set("Authorization", "Bearer admin-token")
      .field("shortcut", " welcome ")
      .field("message", " Welcome ")
      .attach("attachment", Buffer.from("image"), {
        filename: "welcome.png",
        contentType: "image/png"
      });

    expect(response.status).toBe(201);
    expect(service.createQuickReply).toHaveBeenCalledWith("admin-1", {
      shortcut: "welcome",
      message: "Welcome",
      attachment: expect.objectContaining({
        buffer: expect.any(Buffer),
        originalname: "welcome.png",
        mimetype: "image/png",
        size: 5
      })
    });
  });

  it("rejects missing fields, non-images, and images over 5 MiB", async () => {
    const app = createTestApp();
    const headers = { Authorization: "Bearer admin-token" };

    const missingFields = await request(app)
      .post("/api/v1/quick-replies")
      .set(headers)
      .field("shortcut", "welcome");
    const nonImage = await request(app)
      .post("/api/v1/quick-replies")
      .set(headers)
      .field("shortcut", "welcome")
      .field("message", "Welcome")
      .attach("attachment", Buffer.from("text"), {
        filename: "notes.txt",
        contentType: "text/plain"
      });
    const oversized = await request(app)
      .post("/api/v1/quick-replies")
      .set(headers)
      .field("shortcut", "welcome")
      .field("message", "Welcome")
      .attach("attachment", Buffer.alloc(5 * 1024 * 1024 + 1), {
        filename: "large.png",
        contentType: "image/png"
      });

    expect(missingFields.status).toBe(400);
    expect(missingFields.body.error.code).toBe("INVALID_REQUEST");
    expect(nonImage.status).toBe(400);
    expect(nonImage.body.error.code).toBe("INVALID_ATTACHMENT");
    expect(oversized.status).toBe(400);
    expect(oversized.body.error.code).toBe("INVALID_ATTACHMENT");
    expect(service.createQuickReply).not.toHaveBeenCalled();
  });

  it("updates and deletes an owned reply through the authenticated routes", async () => {
    service.updateQuickReply.mockResolvedValue({
      id: "reply-1",
      shortcut: "updated",
      message: "Updated"
    });
    service.deleteQuickReply.mockResolvedValue(undefined);
    const app = createTestApp();

    const updated = await request(app)
      .patch("/api/v1/quick-replies/reply-1")
      .set("Authorization", "Bearer agent-token")
      .field("shortcut", " updated ");
    const deleted = await request(app)
      .delete("/api/v1/quick-replies/reply-1")
      .set("Authorization", "Bearer agent-token");

    expect(updated.status).toBe(200);
    expect(service.updateQuickReply).toHaveBeenCalledWith("agent-1", "reply-1", {
      shortcut: "updated"
    });
    expect(deleted.status).toBe(204);
    expect(service.deleteQuickReply).toHaveBeenCalledWith("agent-1", "reply-1");
  });
});
