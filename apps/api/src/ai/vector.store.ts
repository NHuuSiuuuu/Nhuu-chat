export interface EmbeddedChunk { content: string; chunkIndex: number; documentId: string; embedding: number[]; ownerId?: string; }
export interface RetrievedChunk extends EmbeddedChunk { score: number; }
export interface VectorSearchScope { ownerId?: string; documentIds?: readonly string[]; }
export interface VectorStore { upsert(chunks: EmbeddedChunk[]): Promise<void>; search(vector: number[], topK: number, scope?: VectorSearchScope): Promise<RetrievedChunk[]>; delete(documentId: string): Promise<void>; }

export class InMemoryVectorStore implements VectorStore {
  private readonly chunks = new Map<string, EmbeddedChunk>();
  async upsert(chunks: EmbeddedChunk[]) { for (const chunk of chunks) this.chunks.set(`${chunk.documentId}:${chunk.chunkIndex}`, chunk); }
  async search(vector: number[], topK: number, scope?: VectorSearchScope) {
    const documentIds = scope?.documentIds === undefined ? undefined : new Set(scope.documentIds);
    return [...this.chunks.values()]
      .filter((chunk) => scope?.ownerId === undefined || chunk.ownerId === scope.ownerId)
      .filter((chunk) => documentIds === undefined || documentIds.has(chunk.documentId))
      .map((chunk) => ({ ...chunk, score: cosine(vector, chunk.embedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }
  async delete(documentId: string) { for (const key of this.chunks.keys()) if (key.startsWith(`${documentId}:`)) this.chunks.delete(key); }
}

function cosine(a: number[], b: number[]) {
  const dot = a.reduce((sum, value, index) => sum + value * (b[index] ?? 0), 0);
  const magA = Math.sqrt(a.reduce((sum, value) => sum + value * value, 0)) || 1;
  const magB = Math.sqrt(b.reduce((sum, value) => sum + value * value, 0)) || 1;
  return dot / (magA * magB);
}
