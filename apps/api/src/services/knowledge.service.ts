import { KnowledgeChunkModel, KnowledgeDocumentModel } from "../models/knowledge.model.js";
import { chunkText } from "../knowledge/chunker.js";
import type { EmbeddingProvider } from "../ai/embedding.provider.js";
import type { VectorStore } from "../ai/vector.store.js";

export async function ingestKnowledge(input: { title: string; content: string; sourceType?: "text" | "file" | "url" }, embedding: EmbeddingProvider, store: VectorStore) {
  const document = await KnowledgeDocumentModel.create({ title: input.title, content: input.content, sourceType: input.sourceType ?? "text", status: "processing" });
  const chunks = chunkText(input.content, 800, 80);
  const embedded = [];
  for (const chunk of chunks) embedded.push({ ...chunk, documentId: String(document._id), embedding: await embedding.embed(chunk.content) });
  await KnowledgeChunkModel.insertMany(embedded);
  await store.upsert(embedded);
  document.status = "ready";
  await document.save();
  return document.toObject();
}

export async function deleteKnowledge(documentId: string, store: VectorStore): Promise<void> {
  await KnowledgeChunkModel.deleteMany({ documentId });
  await KnowledgeDocumentModel.findByIdAndDelete(documentId);
  await store.delete(documentId);
}
