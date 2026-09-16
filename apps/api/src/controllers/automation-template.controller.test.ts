import express, { type ErrorRequestHandler } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const assistants = vi.hoisted(() => ({
  listAssistants: vi.fn(), createAssistant: vi.fn(), updateAssistant: vi.fn(), deleteAssistant: vi.fn()
}));
const templates = vi.hoisted(() => ({
  listAutomationTemplates: vi.fn(),
  createAutomationTemplate: vi.fn(),
  importAutomationTemplates: vi.fn(),
  updateAutomationTemplate: vi.fn(),
  deleteAutomationTemplate: vi.fn()
}));
const auth = vi.hoisted(() => ({ verifyAccessToken: vi.fn() }));

vi.mock("../services/assistant.service.js", () => assistants);
vi.mock("../services/automation-template.service.js", () => templates);
vi.mock("../services/auth.service.js", () => auth);

import { AppError, errorHandler } from "../common/errors.js";
import { assistantRouter } from "../routes/assistants.routes.js";

const assistantId = "507f1f77bcf86cd799439011";
const templateId = "507f191e810c19729de860ea";

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/assistants", assistantRouter);
  const captureError: ErrorRequestHandler = (error, req, res, next) => errorHandler(error, req, res, next);
  app.use(captureError);
  return app;
}

describe("automation template controller and routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    auth.verifyAccessToken.mockImplementation(async (token: string) => {
      if (token === "agent-token") return { id: "owner-1", email: "agent@example.com", role: "agent" };
      if (token === "customer-token") return { id: "customer", email: "customer@example.com", role: "customer" };
      throw new Error("invalid token");
    });
  });

  it("lists templates only beneath the authenticated owner's assistant", async () => {
    templates.listAutomationTemplates.mockResolvedValue({ templates: [] });

    const response = await request(createTestApp())
      .get(`/api/v1/assistants/${assistantId}/templates`)
      .set("Authorization", "Bearer agent-token");

    expect(response.status).toBe(200);
    expect(templates.listAutomationTemplates).toHaveBeenCalledWith("owner-1", assistantId);
  });

  it("creates a template only when its body assistant matches the owning route", async () => {
    templates.createAutomationTemplate.mockResolvedValue({ id: templateId });
    const body = {
      assistantId,
      name: "Báo giá",
      keywords: [" giá ", "GIÁ"],
      responseTemplate: "Giá từ 100.000đ"
    };

    const created = await request(createTestApp()).post(`/api/v1/assistants/${assistantId}/templates`)
      .set("Authorization", "Bearer agent-token").send(body);
    const mismatch = await request(createTestApp()).post(`/api/v1/assistants/${assistantId}/templates`)
      .set("Authorization", "Bearer agent-token").send({ ...body, assistantId: templateId });
    const injectedOwner = await request(createTestApp()).post(`/api/v1/assistants/${assistantId}/templates`)
      .set("Authorization", "Bearer agent-token").send({ ...body, ownerId: "attacker" });

    expect(created.status).toBe(201);
    expect(templates.createAutomationTemplate).toHaveBeenCalledWith("owner-1", expect.objectContaining({
      assistantId,
      keywords: ["giá"]
    }));
    expect(mismatch.status).toBe(400);
    expect(injectedOwner.status).toBe(400);
    expect(templates.createAutomationTemplate).toHaveBeenCalledOnce();
  });

  it("imports validated templates under the authenticated assistant", async () => {
    templates.importAutomationTemplates.mockResolvedValue({ imported: 2, templates: [] });
    const body = {
      templates: [
        { name: "Chào", keywords: ["hi"], responseTemplate: "Xin chào", enabled: true },
        { name: "Giá", keywords: ["giá"], responseTemplate: "Báo giá", enabled: false }
      ]
    };

    const imported = await request(createTestApp())
      .post(`/api/v1/assistants/${assistantId}/templates/import`)
      .set("Authorization", "Bearer agent-token")
      .send(body);
    const invalid = await request(createTestApp())
      .post(`/api/v1/assistants/${assistantId}/templates/import`)
      .set("Authorization", "Bearer agent-token")
      .send({ templates: [{ ...body.templates[0], enabled: "yes" }] });

    expect(imported.status).toBe(200);
    expect(templates.importAutomationTemplates).toHaveBeenCalledWith("owner-1", assistantId, body.templates);
    expect(invalid.status).toBe(400);
    expect(templates.importAutomationTemplates).toHaveBeenCalledOnce();
  });

  it("validates, updates, and deletes a template under its route assistant", async () => {
    templates.updateAutomationTemplate.mockResolvedValue({ id: templateId, priority: 5 });
    templates.deleteAutomationTemplate.mockResolvedValue(undefined);

    const invalid = await request(createTestApp())
      .patch(`/api/v1/assistants/${assistantId}/templates/${templateId}`)
      .set("Authorization", "Bearer agent-token").send({ priority: -1 });
    const updated = await request(createTestApp())
      .patch(`/api/v1/assistants/${assistantId}/templates/${templateId}`)
      .set("Authorization", "Bearer agent-token").send({ priority: 5 });
    const deleted = await request(createTestApp())
      .delete(`/api/v1/assistants/${assistantId}/templates/${templateId}`)
      .set("Authorization", "Bearer agent-token");

    expect(invalid.status).toBe(400);
    expect(updated.status).toBe(200);
    expect(templates.updateAutomationTemplate).toHaveBeenCalledWith(
      "owner-1", assistantId, templateId, { priority: 5 }
    );
    expect(deleted.status).toBe(204);
    expect(templates.deleteAutomationTemplate).toHaveBeenCalledWith("owner-1", assistantId, templateId);
  });

  it("enforces route roles and returns not found for a non-owned parent", async () => {
    const unauthorized = await request(createTestApp()).get(`/api/v1/assistants/${assistantId}/templates`);
    const forbidden = await request(createTestApp()).get(`/api/v1/assistants/${assistantId}/templates`)
      .set("Authorization", "Bearer customer-token");
    templates.listAutomationTemplates.mockRejectedValue(
      new AppError(404, "ASSISTANT_NOT_FOUND", "Assistant was not found")
    );
    const missing = await request(createTestApp()).get(`/api/v1/assistants/${assistantId}/templates`)
      .set("Authorization", "Bearer agent-token");

    expect(unauthorized.status).toBe(401);
    expect(forbidden.status).toBe(403);
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe("ASSISTANT_NOT_FOUND");
    expect(templates.listAutomationTemplates).toHaveBeenCalledOnce();
  });
});
