import express, { type ErrorRequestHandler } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dependencies = vi.hoisted(() => ({
  verifyAccessToken: vi.fn(),
  assistantFindOne: vi.fn(),
  templateFind: vi.fn(),
  knowledgeFind: vi.fn(),
  embed: vi.fn(),
  vectorSearch: vi.fn(),
  reply: vi.fn(),
  messageCreate: vi.fn(),
  processingCreate: vi.fn(),
  enqueue: vi.fn()
}));

vi.mock("../services/auth.service.js", () => ({
  verifyAccessToken: dependencies.verifyAccessToken
}));
vi.mock("../models/assistant.model.js", () => ({
  AssistantModel: { findOne: dependencies.assistantFindOne }
}));
vi.mock("../models/automation-template.model.js", () => ({
  AutomationTemplateModel: { find: dependencies.templateFind }
}));
vi.mock("../models/knowledge.model.js", () => ({
  KnowledgeChunkModel: { find: dependencies.knowledgeFind }
}));
vi.mock("../ai/embedding.provider.js", () => ({
  DeterministicEmbeddingProvider: vi.fn(() => ({ embed: dependencies.embed }))
}));
vi.mock("../ai/knowledge-runtime.js", () => ({
  knowledgeEmbedding: { embed: dependencies.embed },
  knowledgeVectorStore: { search: dependencies.vectorSearch }
}));
vi.mock("../chatbot/gemini-bot.provider.js", () => ({
  GeminiBotProvider: vi.fn(() => ({ reply: dependencies.reply }))
}));
vi.mock("../models/message.model.js", () => ({
  MessageModel: { create: dependencies.messageCreate }
}));
vi.mock("../models/bot-processing.model.js", () => ({
  BotProcessingModel: { create: dependencies.processingCreate }
}));
vi.mock("../jobs/outbound.queue.js", () => ({
  OutboundQueue: vi.fn(() => ({ enqueue: dependencies.enqueue }))
}));

import { errorHandler } from "../common/errors.js";
import { assistantRouter } from "../routes/assistants.routes.js";

const assistantId = "507f1f77bcf86cd799439011";
const ownerId = "507f191e810c19729de860ea";

const assistant = {
  _id: assistantId,
  ownerId,
  name: "Tư vấn",
  instructions: "Chỉ trả lời theo tài liệu.",
  modelTier: "smart",
  enabled: true,
  fallbackMessage: "Nhân viên sẽ hỗ trợ bạn.",
  channelScope: { mode: "all", identifiers: [] },
  isDefault: true
};

function queryResult<T>(value: T) {
  return { lean: vi.fn().mockResolvedValue(value) };
}

function sortedQueryResult<T>(value: T) {
  return { sort: vi.fn().mockReturnValue(queryResult(value)) };
}

function limitedQueryResult<T>(value: T) {
  return { limit: vi.fn().mockReturnValue(queryResult(value)) };
}

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/assistants", assistantRouter);
  const captureError: ErrorRequestHandler = (error, req, res, next) => errorHandler(error, req, res, next);
  app.use(captureError);
  return app;
}

describe("assistant preview controller and service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    dependencies.verifyAccessToken.mockResolvedValue({
      id: ownerId,
      email: "agent@example.com",
      role: "agent"
    });
    dependencies.assistantFindOne.mockReturnValue(queryResult(assistant));
    dependencies.templateFind.mockReturnValue(sortedQueryResult([]));
    dependencies.knowledgeFind.mockReturnValue(limitedQueryResult([]));
    dependencies.embed.mockResolvedValue([1, 0]);
    dependencies.vectorSearch.mockResolvedValue([]);
    dependencies.reply.mockResolvedValue({ answer: "Có căn cứ", handoff: false, sources: [] });
  });

  it("previews an exact non-rewritten template using only the authenticated owner scope", async () => {
    dependencies.templateFind.mockReturnValue(sortedQueryResult([{
      id: "template-1",
      ownerId,
      assistantId,
      name: "Chào",
      keywords: ["xin chào"],
      responseTemplate: "Xin chào, mình có thể giúp gì?",
      allowAiRewrite: false,
      priority: 10,
      enabled: true,
      channelScope: { mode: "all", identifiers: [] },
      createdAt: "2026-09-14T00:00:00.000Z",
      updatedAt: "2026-09-14T00:00:00.000Z"
    }]));
    dependencies.reply.mockResolvedValue({
      answer: "Xin chào, mình có thể giúp gì?",
      handoff: false,
      sources: []
    });

    const response = await request(createTestApp())
      .post(`/api/v1/assistants/${assistantId}/preview`)
      .set("Authorization", "Bearer agent-token")
      .send({
        message: "Xin chào shop",
        history: [{ role: "customer", content: "Tôi cần tư vấn" }],
        platform: "telegram",
        channelId: "shop-channel"
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      answer: "Xin chào, mình có thể giúp gì?",
      source: "template",
      handoff: false
    });
    expect(dependencies.assistantFindOne).toHaveBeenCalledWith({ _id: assistantId, ownerId });
    expect(dependencies.templateFind).toHaveBeenCalledWith({ ownerId, assistantId, enabled: true });
    expect(dependencies.reply).toHaveBeenCalledWith(expect.objectContaining({
      assistant: expect.objectContaining({ fallbackMessage: "Nhân viên sẽ hỗ trợ bạn." }),
      message: "Xin chào shop",
      history: [{ role: "customer", content: "Tôi cần tư vấn" }],
      template: expect.objectContaining({
        responseTemplate: "Xin chào, mình có thể giúp gì?",
        allowAiRewrite: false
      })
    }));
    expect(dependencies.knowledgeFind).not.toHaveBeenCalled();
  });

  it("retrieves owner-scoped knowledge for a RAG preview and reports AI source", async () => {
    dependencies.vectorSearch.mockResolvedValue([{
      ownerId,
      documentId: "507f1f77bcf86cd799439012",
      chunkIndex: 2,
      content: "Đổi hàng trong 7 ngày.",
      embedding: [1, 0],
      score: 1
    }]);
    dependencies.reply.mockResolvedValue({
      answer: "Bạn có thể đổi hàng trong 7 ngày.",
      handoff: false,
      sources: [{ documentId: "507f1f77bcf86cd799439012", chunkIndex: 2 }]
    });

    const response = await request(createTestApp())
      .post(`/api/v1/assistants/${assistantId}/preview`)
      .set("Authorization", "Bearer agent-token")
      .send({ message: "Tôi được đổi hàng trong bao lâu?" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      answer: "Bạn có thể đổi hàng trong 7 ngày.",
      source: "ai",
      handoff: false
    });
    expect(dependencies.vectorSearch).toHaveBeenCalledWith([1, 0], 5, { ownerId });
    expect(dependencies.knowledgeFind).not.toHaveBeenCalled();
    expect(dependencies.reply).toHaveBeenCalledWith(expect.objectContaining({
      context: [expect.objectContaining({
        documentId: "507f1f77bcf86cd799439012",
        chunkIndex: 2,
        content: "Đổi hàng trong 7 ngày.",
        score: 1
      })]
    }));
  });

  it("finds a matching indexed chunk after the first fifty persisted chunks", async () => {
    const irrelevantChunks = Array.from({ length: 50 }, (_, index) => ({
      ownerId,
      documentId: `irrelevant-${index}`,
      chunkIndex: 0,
      content: `Nội dung không liên quan ${index}`,
      embedding: [0, 1]
    }));
    const matchingChunk = {
      ownerId,
      documentId: "matching-after-fifty",
      chunkIndex: 0,
      content: "Đổi hàng trong 7 ngày.",
      embedding: [1, 0],
      score: 1
    };
    dependencies.knowledgeFind.mockReturnValue(limitedQueryResult(irrelevantChunks));
    dependencies.vectorSearch.mockResolvedValue([matchingChunk]);
    dependencies.reply.mockImplementation(async (input: {
      assistant: { fallbackMessage: string };
      context?: Array<{ documentId: string; chunkIndex: number }>;
    }) => input.context?.some((chunk) => chunk.documentId === matchingChunk.documentId)
      ? {
          answer: "Bạn có thể đổi hàng trong 7 ngày.",
          handoff: false,
          sources: [{ documentId: matchingChunk.documentId, chunkIndex: 0 }]
        }
      : { answer: input.assistant.fallbackMessage, handoff: true, sources: [] });

    const response = await request(createTestApp())
      .post(`/api/v1/assistants/${assistantId}/preview`)
      .set("Authorization", "Bearer agent-token")
      .send({ message: "Tôi được đổi hàng trong bao lâu?" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      answer: "Bạn có thể đổi hàng trong 7 ngày.",
      source: "ai",
      handoff: false
    });
    expect(dependencies.knowledgeFind).not.toHaveBeenCalled();
  });

  it("returns fallback source without leaking provider failures", async () => {
    dependencies.reply.mockRejectedValue(new Error("provider-secret-detail"));

    const response = await request(createTestApp())
      .post(`/api/v1/assistants/${assistantId}/preview`)
      .set("Authorization", "Bearer agent-token")
      .send({ message: "Tôi cần hỗ trợ" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      answer: "Nhân viên sẽ hỗ trợ bạn.",
      source: "fallback",
      handoff: true
    });
    expect(JSON.stringify(response.body)).not.toContain("provider-secret-detail");
  });

  it("validates the route id and bounded preview body before reading data", async () => {
    const invalidId = await request(createTestApp())
      .post("/api/v1/assistants/not-an-id/preview")
      .set("Authorization", "Bearer agent-token")
      .send({ message: "Xin chào" });
    const invalidBody = await request(createTestApp())
      .post(`/api/v1/assistants/${assistantId}/preview`)
      .set("Authorization", "Bearer agent-token")
      .send({ message: " ", history: Array.from({ length: 21 }, () => ({ role: "customer", content: "x" })) });

    expect(invalidId.status).toBe(400);
    expect(invalidBody.status).toBe(400);
    expect(dependencies.assistantFindOne).not.toHaveBeenCalled();
  });

  it("returns not found for a different owner's assistant", async () => {
    dependencies.assistantFindOne.mockReturnValue(queryResult(null));

    const response = await request(createTestApp())
      .post(`/api/v1/assistants/${assistantId}/preview`)
      .set("Authorization", "Bearer agent-token")
      .send({ message: "Xin chào" });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("ASSISTANT_NOT_FOUND");
  });

  it("does not persist messages, create processing state, or enqueue channel delivery", async () => {
    const response = await request(createTestApp())
      .post(`/api/v1/assistants/${assistantId}/preview`)
      .set("Authorization", "Bearer agent-token")
      .send({ message: "Xin chào" });

    expect(response.status).toBe(200);
    expect(dependencies.messageCreate).not.toHaveBeenCalled();
    expect(dependencies.processingCreate).not.toHaveBeenCalled();
    expect(dependencies.enqueue).not.toHaveBeenCalled();
  });
});
