import { DeterministicEmbeddingProvider } from "./embedding.provider.js";
import { InMemoryVectorStore, type VectorStore } from "./vector.store.js";
import { KnowledgeChunkModel, KnowledgeDocumentModel } from "../models/knowledge.model.js";

export const knowledgeEmbedding = new DeterministicEmbeddingProvider();
export const knowledgeVectorStore = new InMemoryVectorStore();

interface PersistedKnowledgeChunk {
  ownerId: unknown;
  documentId: unknown;
  chunkIndex: number;
  content: string;
  embedding: number[];
}

// Cách ly bản ghi legacy khỏi index; chỉ nạp chunk có owner khớp document đã xác minh.
export async function hydrateKnowledgeVectorStore(
  store: VectorStore = knowledgeVectorStore
): Promise<void> {
  const rows = await KnowledgeChunkModel.find({}).lean();
  const documents = await KnowledgeDocumentModel.find({
    _id: { $in: rows.map((row) => row.documentId) },
    ownerId: { $type: "objectId" }
  }).lean();
  const owners = new Map(documents.filter((document) => document.ownerId).map((document) => [String(document._id), String(document.ownerId)]));
  const chunks = rows as unknown as PersistedKnowledgeChunk[];
  const valid = chunks.filter((row) => row.ownerId != null && owners.get(String(row.documentId)) === String(row.ownerId));
  const eligible = new Set(valid);
  const quarantined = chunks.filter((row) => !eligible.has(row));
  // Chỉ xóa khỏi index có thể dựng lại, giữ nguyên document/chunk gốc để re-ingest có kiểm chứng.
  for (const documentId of new Set(quarantined.map((row) => String(row.documentId)))) await store.delete(documentId);
  if (quarantined.length) console.warn("KNOWLEDGE_OWNER_QUARANTINED", { chunks: quarantined.length });
  await store.upsert(valid.map((row) => ({
    ownerId: String(row.ownerId),
    documentId: String(row.documentId),
    chunkIndex: row.chunkIndex,
    content: row.content,
    embedding: row.embedding
  })));
}
