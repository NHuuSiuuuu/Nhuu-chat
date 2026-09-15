import { KnowledgeChunkModel, KnowledgeDocumentModel } from "../models/knowledge.model.js";
import { chunkText } from "../knowledge/chunker.js";
import type { EmbeddingProvider } from "../ai/embedding.provider.js";
import type { VectorStore } from "../ai/vector.store.js";

export async function ingestKnowledge(ownerId: string, input: { title: string; content: string; sourceType?: "text" | "file" | "url" }, embedding: EmbeddingProvider, store: VectorStore) {
  const document = await KnowledgeDocumentModel.create({ ownerId, title: input.title, content: input.content, sourceType: input.sourceType ?? "text", status: "processing" });
  const chunks = chunkText(input.content, 800, 80);
  const embedded = [];
  for (const chunk of chunks) embedded.push({ ...chunk, ownerId, documentId: String(document._id), embedding: await embedding.embed(chunk.content) });
  await KnowledgeChunkModel.insertMany(embedded);
  await store.upsert(embedded);
  document.status = "ready";
  await document.save();
  return document.toObject();
}

export async function listKnowledge(ownerId: string) {
  const documents = await KnowledgeDocumentModel.find({ ownerId })
    .select("_id title sourceType status createdAt updatedAt")
    .sort({ createdAt: -1, _id: -1 })
    .lean();
  return { documents };
}

export async function deleteKnowledge(ownerId: string, documentId: string, store: VectorStore): Promise<void> {
  await KnowledgeChunkModel.deleteMany({ ownerId, documentId });
  const document = await KnowledgeDocumentModel.findOneAndDelete({ _id: documentId, ownerId });
  if (document) await store.delete(documentId);
}
