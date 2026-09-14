import { describe, expect, it } from "vitest";
import { DeterministicEmbeddingProvider } from "./embedding.provider.js";
import { GroundedEchoProvider } from "./llm.provider.js";
import { RagService } from "./rag.service.js";
import { InMemoryVectorStore } from "./vector.store.js";
describe("RagService", () => {
  it("hands off when no context is available", async () => {
    const result = await new RagService(new DeterministicEmbeddingProvider(), new InMemoryVectorStore(), new GroundedEchoProvider()).answer("unknown");
    expect(result.handoff).toBe(true);
    expect(result.sources).toEqual([]);
  });

  it("excludes relevant chunks that belong to another owner", async () => {
    const embedding = new DeterministicEmbeddingProvider();
    const store = new InMemoryVectorStore();
    const question = "shipping policy";
    await store.upsert([{
      ownerId: "owner-1",
      documentId: "document-1",
      chunkIndex: 0,
      content: "Private shop policy",
      embedding: await embedding.embed(question)
    }]);

    const result = await new RagService(embedding, store, new GroundedEchoProvider())
      .answer(question, { ownerId: "owner-2" });

    expect(result.handoff).toBe(true);
    expect(result.sources).toEqual([]);
  });

  it("restricts context to selected documents within the owner", async () => {
    const embedding = new DeterministicEmbeddingProvider();
    const store = new InMemoryVectorStore();
    const question = "return policy";
    const vector = await embedding.embed(question);
    await store.upsert([
      {
        ownerId: "owner-1", documentId: "selected", chunkIndex: 0,
        content: "Selected policy", embedding: vector
      },
      {
        ownerId: "owner-1", documentId: "not-selected", chunkIndex: 0,
        content: "Other policy", embedding: vector
      }
    ]);

    const result = await new RagService(embedding, store, new GroundedEchoProvider())
      .answer(question, { ownerId: "owner-1", documentIds: ["selected"] });

    expect(result.handoff).toBe(false);
    expect(result.sources).toEqual([{ documentId: "selected", chunkIndex: 0 }]);
    expect(result.answer).toContain("Selected policy");
    expect(result.answer).not.toContain("Other policy");
  });
});
