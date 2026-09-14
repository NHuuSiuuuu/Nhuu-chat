import express, { type ErrorRequestHandler } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const assistants = vi.hoisted(() => ({
  listAssistants: vi.fn(),
  createAssistant: vi.fn(),
  updateAssistant: vi.fn(),
  deleteAssistant: vi.fn()
}));
const templates = vi.hoisted(() => ({
  listAutomationTemplates: vi.fn(),
  createAutomationTemplate: vi.fn(),
  updateAutomationTemplate: vi.fn(),
  deleteAutomationTemplate: vi.fn()
}));
const auth = vi.hoisted(() => ({ verifyAccessToken: vi.fn() }));

vi.mock("../services/assistant.service.js", () => assistants);
vi.mock("../services/automation-template.service.js", () => templates);
vi.mock("../services/auth.service.js", () => auth);

import { AppError, errorHandler } from "../common/errors.js";
import { createApp } from "../app.js";
import { assistantRouter } from "../routes/assistants.routes.js";

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/assistants", assistantRouter);
  const captureError: ErrorRequestHandler = (error, req, res, next) => errorHandler(error, req, res, next);
  app.use(captureError);
  return app;
}

describe("assistant controller and routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    auth.verifyAccessToken.mockImplementation(async (token: string) => {
      if (token === "admin-token") return { id: "owner-admin", email: "admin@example.com", role: "admin" };
      if (token === "agent-token") return { id: "owner-agent", email: "agent@example.com", role: "agent" };
      if (token === "customer-token") return { id: "customer", email: "customer@example.com", role: "customer" };
      throw new Error("invalid token");
    });
  });

  it("mounts the assistant API in the application behind authentication", async () => {
    const response = await request(createApp()).get("/api/v1/assistants");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  it("allows admin and agent roles and always uses the authenticated owner", async () => {
    assistants.listAssistants.mockResolvedValue({ assistants: [] });

    const admin = await request(createTestApp()).get("/api/v1/assistants").set("Authorization", "Bearer admin-token");
    const agent = await request(createTestApp()).get("/api/v1/assistants").set("Authorization", "Bearer agent-token");

    expect(admin.status).toBe(200);
    expect(agent.status).toBe(200);
    expect(assistants.listAssistants).toHaveBeenNthCalledWith(1, "owner-admin");
    expect(assistants.listAssistants).toHaveBeenNthCalledWith(2, "owner-agent");
  });

  it("rejects unauthenticated and disallowed roles before service access", async () => {
    const unauthenticated = await request(createTestApp()).get("/api/v1/assistants");
    const forbidden = await request(createTestApp()).get("/api/v1/assistants").set("Authorization", "Bearer customer-token");

    expect(unauthenticated.status).toBe(401);
    expect(forbidden.status).toBe(403);
    expect(assistants.listAssistants).not.toHaveBeenCalled();
  });

  it("creates an assistant without accepting ownerId from the body", async () => {
    assistants.createAssistant.mockResolvedValue({ id: "assistant-1" });
    const body = { name: "Bán hàng", instructions: "Trả lời thân thiện" };

    const created = await request(createTestApp())
      .post("/api/v1/assistants")
      .set("Authorization", "Bearer admin-token")
      .send(body);
    const injectedOwner = await request(createTestApp())
      .post("/api/v1/assistants")
      .set("Authorization", "Bearer admin-token")
      .send({ ...body, ownerId: "attacker" });

    expect(created.status).toBe(201);
    expect(assistants.createAssistant).toHaveBeenCalledWith("owner-admin", expect.objectContaining(body));
    expect(injectedOwner.status).toBe(400);
    expect(assistants.createAssistant).toHaveBeenCalledOnce();
  });

  it("validates patches and updates and deletes the owned resource", async () => {
    const id = "507f1f77bcf86cd799439011";
    assistants.updateAssistant.mockResolvedValue({ id, enabled: false });
    assistants.deleteAssistant.mockResolvedValue(undefined);

    const invalid = await request(createTestApp()).patch(`/api/v1/assistants/${id}`)
      .set("Authorization", "Bearer agent-token").send({ modelTier: "premium" });
    const updated = await request(createTestApp()).patch(`/api/v1/assistants/${id}`)
      .set("Authorization", "Bearer agent-token").send({ enabled: false });
    const deleted = await request(createTestApp()).delete(`/api/v1/assistants/${id}`)
      .set("Authorization", "Bearer agent-token");

    expect(invalid.status).toBe(400);
    expect(updated.status).toBe(200);
    expect(assistants.updateAssistant).toHaveBeenCalledWith("owner-agent", id, { enabled: false });
    expect(deleted.status).toBe(204);
    expect(assistants.deleteAssistant).toHaveBeenCalledWith("owner-agent", id);
  });

  it("returns not found when the owner cannot access the assistant", async () => {
    const id = "507f1f77bcf86cd799439011";
    assistants.updateAssistant.mockRejectedValue(new AppError(404, "ASSISTANT_NOT_FOUND", "Assistant was not found"));

    const response = await request(createTestApp()).patch(`/api/v1/assistants/${id}`)
      .set("Authorization", "Bearer admin-token").send({ enabled: false });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("ASSISTANT_NOT_FOUND");
  });
});
