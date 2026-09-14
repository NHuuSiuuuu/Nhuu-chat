import { DeterministicEmbeddingProvider } from "./embedding.provider.js";
import { InMemoryVectorStore, type VectorStore } from "./vector.store.js";
import { KnowledgeChunkModel } from "../models/knowledge.model.js";

export const knowledgeEmbedding = new DeterministicEmbeddingProvider();
export const knowledgeVectorStore = new InMemoryVectorStore();

interface PersistedKnowledgeChunk {
  ownerId: unknown;
  documentId: unknown;
  chunkIndex: number;
  content: string;
  embedding: number[];
}

// Nạp lại toàn bộ knowledge đã lưu để index dùng được ngay sau khi API khởi động.
export async function hydrateKnowledgeVectorStore(
  store: VectorStore = knowledgeVectorStore
): Promise<void> {
  const rows = await KnowledgeChunkModel.find({}).lean();
  await store.upsert((rows as unknown as PersistedKnowledgeChunk[]).map((row) => ({
    ownerId: String(row.ownerId),
    documentId: String(row.documentId),
    chunkIndex: row.chunkIndex,
    content: row.content,
    embedding: row.embedding
  })));
}
