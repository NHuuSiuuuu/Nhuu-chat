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
});
