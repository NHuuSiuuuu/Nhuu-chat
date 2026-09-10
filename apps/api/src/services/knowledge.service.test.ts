import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  create: vi.fn(), insertMany: vi.fn(), deleteMany: vi.fn(), findByIdAndDelete: vi.fn()
}));
vi.mock("../models/knowledge.model.js", () => ({
  KnowledgeDocumentModel: { create: database.create, findByIdAndDelete: database.findByIdAndDelete },
  KnowledgeChunkModel: { insertMany: database.insertMany, deleteMany: database.deleteMany }
}));

import { DeterministicEmbeddingProvider } from "../ai/embedding.provider.js";
import { InMemoryVectorStore } from "../ai/vector.store.js";
import { deleteKnowledge, ingestKnowledge } from "./knowledge.service.js";

describe("knowledge service without Mongo", () => {
  beforeEach(() => vi.resetAllMocks());

  it("embeds and stores content before saving and returning a ready document", async () => {
    const embedding = new DeterministicEmbeddingProvider();
    const store = new InMemoryVectorStore();
    const savedStatuses: string[] = [];
    const document = {
      _id: "knowledge-1", title: "FAQ", content: "Answer", sourceType: "text",
      sourceUrl: "", status: "processing", error: "",
      createdAt: new Date("2026-09-10T00:00:00Z"), updatedAt: new Date("2026-09-10T00:00:00Z"),
      async save() { savedStatuses.push(this.status); },
      toObject() {
        const { save: _save, toObject: _toObject, ...data } = this;
        return data;
      }
    };
    database.create.mockResolvedValue(document);

    const result = await ingestKnowledge({ title: "FAQ", content: "Answer" }, embedding, store);

    expect(database.create).toHaveBeenCalledWith({
      title: "FAQ", content: "Answer", sourceType: "text", status: "processing"
    });
    expect(savedStatuses).toEqual(["ready"]);
    expect(result).toMatchObject({ _id: "knowledge-1", title: "FAQ", content: "Answer", status: "ready" });
    const retrieved = await store.search(await embedding.embed("Answer"), 5);
    expect(retrieved).toHaveLength(1);
    expect(retrieved[0]).toMatchObject({ documentId: "knowledge-1", chunkIndex: 0, content: "Answer" });
    expect(retrieved[0]?.score).toBeCloseTo(1);
    expect(database.insertMany).toHaveBeenCalledWith([
      { documentId: "knowledge-1", chunkIndex: 0, content: "Answer", embedding: retrieved[0]?.embedding }
    ]);
  });

  it("deletes document chunks and vectors without removing another document", async () => {
    const store = new InMemoryVectorStore();
    await store.upsert([
      { documentId: "knowledge-1", chunkIndex: 0, content: "Remove", embedding: [1, 0] },
      { documentId: "knowledge-2", chunkIndex: 0, content: "Keep", embedding: [1, 0] }
    ]);

    await deleteKnowledge("knowledge-1", store);

    expect(database.deleteMany).toHaveBeenCalledWith({ documentId: "knowledge-1" });
    expect(database.findByIdAndDelete).toHaveBeenCalledWith("knowledge-1");
    expect(await store.search([1, 0], 5)).toEqual([
      { documentId: "knowledge-2", chunkIndex: 0, content: "Keep", embedding: [1, 0], score: 1 }
    ]);
  });

  it("propagates a failed chunk deletion before deleting the document or vectors", async () => {
    const failure = new Error("chunk deletion failed");
    database.deleteMany.mockRejectedValue(failure);
    const store = new InMemoryVectorStore();
    await store.upsert([
      { documentId: "knowledge-1", chunkIndex: 0, content: "Keep", embedding: [1, 0] }
    ]);

    await expect(deleteKnowledge("knowledge-1", store)).rejects.toBe(failure);

    expect(database.findByIdAndDelete).not.toHaveBeenCalled();
    expect(await store.search([1, 0], 5)).toHaveLength(1);
  });
});
