import express, { type ErrorRequestHandler } from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const services = vi.hoisted(() => ({ ingestKnowledge: vi.fn(), deleteKnowledge: vi.fn() }));
vi.mock("../services/knowledge.service.js", () => services);

import { DeterministicEmbeddingProvider } from "../ai/embedding.provider.js";
import { InMemoryVectorStore } from "../ai/vector.store.js";
import { AppError, errorHandler } from "../common/errors.js";
import { createKnowledge, removeKnowledge } from "./knowledge.controller.js";

function createTestApp(onError = (_error: unknown) => {}) {
  const app = express();
  app.use(express.json());
  app.post("/knowledge", createKnowledge);
  app.delete("/knowledge/:id", removeKnowledge);
  const captureError: ErrorRequestHandler = (error, req, res, next) => {
    onError(error);
    errorHandler(error, req, res, next);
  };
  app.use(captureError);
  return app;
}

describe("knowledge controller without Mongo", () => {
  beforeEach(() => vi.resetAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("returns the created document with 201 and preserves input whitespace", async () => {
    services.ingestKnowledge.mockResolvedValue({
      _id: "knowledge-1", title: "FAQ", content: " Answer ", sourceType: "text", status: "ready"
    });
    const response = await request(createTestApp()).post("/knowledge")
      .send({ title: " FAQ ", content: " Answer " });

    expect(services.ingestKnowledge).toHaveBeenCalledWith(
      { title: " FAQ ", content: " Answer " },
      expect.any(DeterministicEmbeddingProvider), expect.any(InMemoryVectorStore)
    );
    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      _id: "knowledge-1", title: "FAQ", content: " Answer ", sourceType: "text", status: "ready"
    });
  });

  it("deletes the requested document and returns an empty 204 response", async () => {
    const response = await request(createTestApp()).delete("/knowledge/knowledge-1");

    expect(services.deleteKnowledge).toHaveBeenCalledWith("knowledge-1", expect.any(InMemoryVectorStore));
    expect(response.status).toBe(204);
    expect(response.text).toBe("");
  });

  it.each(["create", "delete"] as const)("forwards %s service errors unchanged", async (operation) => {
    const failure = new Error("knowledge storage unavailable");
    services.ingestKnowledge.mockRejectedValue(failure);
    services.deleteKnowledge.mockRejectedValue(failure);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const onError = vi.fn();
    const app = createTestApp(onError);
    const response = operation === "create"
      ? await request(app).post("/knowledge").send({ title: "FAQ", content: "Answer" })
      : await request(app).delete("/knowledge/knowledge-1");

    expect(onError).toHaveBeenCalledExactlyOnceWith(failure);
    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" }
    });
  });

  it("retains an AppError status and body from the service", async () => {
    const failure = new AppError(503, "KNOWLEDGE_UNAVAILABLE", "Knowledge is unavailable");
    services.ingestKnowledge.mockRejectedValue(failure);
    const onError = vi.fn();
    const response = await request(createTestApp(onError)).post("/knowledge")
      .send({ title: "FAQ", content: "Answer" });

    expect(onError).toHaveBeenCalledExactlyOnceWith(failure);
    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      error: { code: "KNOWLEDGE_UNAVAILABLE", message: "Knowledge is unavailable" }
    });
  });
});
