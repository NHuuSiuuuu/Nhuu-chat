import type { EmbeddingProvider } from "./embedding.provider.js";
import type { LlmProvider } from "./llm.provider.js";
import type { RetrievedChunk } from "./vector.store.js";
import type { VectorSearchScope, VectorStore } from "./vector.store.js";
import { HANDOFF_MESSAGE } from "./prompt.js";

export class RagService {
  constructor(private readonly embedding: EmbeddingProvider, private readonly store: VectorStore, private readonly llm: LlmProvider) {}
  async answer(question: string, scope?: VectorSearchScope) {
    const vector = await this.embedding.embed(question);
    const context = await this.store.search(vector, 5, scope);
    const useful = context.filter((chunk) => chunk.score >= 0.35);
    if (useful.length === 0) return { answer: HANDOFF_MESSAGE, sources: [], handoff: true };
    return { answer: await this.llm.answer({ question, context: useful }), sources: useful.map(sourceRef), handoff: false };
  }
}

function sourceRef(chunk: RetrievedChunk) { return { documentId: chunk.documentId, chunkIndex: chunk.chunkIndex }; }
