import { describe, expect, it } from "vitest";

import { DeterministicEmbeddingProvider } from "./embedding.provider.js";
import { InMemoryVectorStore } from "./vector.store.js";

describe("in-memory vector store", () => {
  it("prioritizes Vietnamese knowledge matching the customer question", async () => {
    const embedding = new DeterministicEmbeddingProvider();
    const store = new InMemoryVectorStore();
    const vector = await embedding.embed("cho tôi địa chỉ");

    await store.upsert([
      {
        ownerId: "owner-1",
        documentId: "unrelated",
        chunkIndex: 0,
        content: "Học phí khóa giao tiếp dành cho sinh viên.",
        embedding: await embedding.embed("Học phí khóa giao tiếp dành cho sinh viên.")
      },
      {
        ownerId: "owner-1",
        documentId: "address",
        chunkIndex: 0,
        content: "Địa chỉ trung tâm Global English: 123 đường ABC, Hà Nội.",
        embedding: await embedding.embed("Địa chỉ trung tâm Global English: 123 đường ABC, Hà Nội.")
      }
    ]);

    const results = await store.search(vector, 2, { ownerId: "owner-1", query: "cho tôi địa chỉ" });

    expect(results[0]).toMatchObject({ documentId: "address" });
    expect(results[0]?.score).toBeGreaterThan(0.35);
    expect(results[1]?.score).toBeLessThan(0.35);
  });
});
