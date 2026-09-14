import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  find: vi.fn(),
  documents: vi.fn()
}));

vi.mock("../models/knowledge.model.js", () => ({
  KnowledgeChunkModel: { find: database.find },
  KnowledgeDocumentModel: { find: database.documents }
}));

import { hydrateKnowledgeVectorStore, knowledgeVectorStore } from "./knowledge-runtime.js";
import { InMemoryVectorStore } from "./vector.store.js";

function persistedChunk(input: {
  id: string;
  ownerId: string;
  documentId: string;
  content: string;
  embedding: number[];
}) {
  return {
    _id: input.id,
    ownerId: input.ownerId,
    documentId: input.documentId,
    chunkIndex: 0,
    content: input.content,
    embedding: input.embedding,
    sourceMetadata: {},
    createdAt: new Date("2026-09-14T00:00:00.000Z"),
    updatedAt: new Date("2026-09-14T00:00:00.000Z")
  };
}

describe("knowledge vector runtime hydration", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    database.documents.mockReturnValue({ lean: async () => [
      { _id: "document-1", ownerId: "owner-1" },
      { _id: "document-2", ownerId: "owner-2" }
    ] });
  });

  it("quarantines legacy ownerless chunks/documents and mismatched owners instead of hydrating undefined", async () => {
    const base = { documentId: "legacy-document", chunkIndex: 0, content: "Legacy secret", embedding: [1, 0] };
    database.find.mockReturnValue({ lean: async () => [
      base,
      { ...base, documentId: "null-owner", ownerId: null },
      { ...base, documentId: "legacy-document", ownerId: "owner-1", chunkIndex: 1 },
      { ...base, documentId: "document-2", ownerId: "owner-1" },
      { ...base, documentId: "document-1", ownerId: "owner-1", content: "Trusted knowledge" }
    ] });
    const store = new InMemoryVectorStore();
    await hydrateKnowledgeVectorStore(store);
    expect(await store.search([1, 0], 10, { ownerId: "undefined" })).toEqual([]);
    expect(await store.search([1, 0], 10, { ownerId: "null" })).toEqual([]);
    expect(await store.search([1, 0], 10, { ownerId: "owner-1" })).toEqual([expect.objectContaining({ documentId: "document-1", content: "Trusted knowledge" })]);
  });

  it("reloads persisted chunks into a fresh owner-scoped vector store", async () => {
    database.find.mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        persistedChunk({
          id: "chunk-1",
          ownerId: "owner-1",
          documentId: "document-1",
          content: "Đổi hàng trong 7 ngày.",
          embedding: [1, 0]
        }),
        persistedChunk({
          id: "chunk-2",
          ownerId: "owner-2",
          documentId: "document-2",
          content: "Chính sách riêng của shop khác.",
          embedding: [1, 0]
        })
      ])
    });
    expect(await knowledgeVectorStore.search([1, 0], 5, { ownerId: "owner-1" })).toEqual([]);

    await hydrateKnowledgeVectorStore();

    expect(await knowledgeVectorStore.search([1, 0], 5, { ownerId: "owner-1" })).toEqual([{
      ownerId: "owner-1",
      documentId: "document-1",
      chunkIndex: 0,
      content: "Đổi hàng trong 7 ngày.",
      embedding: [1, 0],
      score: 1
    }]);
  });
});
