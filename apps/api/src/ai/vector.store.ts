export interface EmbeddedChunk { content: string; chunkIndex: number; documentId: string; embedding: number[]; ownerId?: string; }
export interface RetrievedChunk extends EmbeddedChunk { score: number; }
export interface VectorSearchScope { ownerId?: string; documentIds?: readonly string[]; query?: string; }
export interface VectorStore { upsert(chunks: EmbeddedChunk[]): Promise<void>; search(vector: number[], topK: number, scope?: VectorSearchScope): Promise<RetrievedChunk[]>; delete(documentId: string): Promise<void>; }

export class InMemoryVectorStore implements VectorStore {
  private readonly chunks = new Map<string, EmbeddedChunk>();
  async upsert(chunks: EmbeddedChunk[]) { for (const chunk of chunks) this.chunks.set(`${chunk.documentId}:${chunk.chunkIndex}`, chunk); }
  async search(vector: number[], topK: number, scope?: VectorSearchScope) {
    const documentIds = scope?.documentIds === undefined ? undefined : new Set(scope.documentIds);
    return [...this.chunks.values()]
      .filter((chunk) => scope?.ownerId === undefined || chunk.ownerId === scope.ownerId)
      .filter((chunk) => documentIds === undefined || documentIds.has(chunk.documentId))
      .map((chunk) => ({ ...chunk, score: combinedScore(vector, chunk.embedding, scope?.query, chunk.content) }))
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

const SEARCH_STOP_WORDS = new Set(["cho", "toi", "cua", "la", "va", "co", "the", "mot", "bao", "nhieu"]);

function normalizedTokens(value: string): string[] {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/giu, "d")
    .toLocaleLowerCase("vi")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 1 && !SEARCH_STOP_WORDS.has(token));
}

// Kết hợp tín hiệu từ khóa tiếng Việt với cosine giả lập để không xếp nhầm tài liệu liên quan.
function lexicalScore(query: string | undefined, content: string): number {
  if (!query?.trim()) return 0;
  const queryTokens = normalizedTokens(query);
  if (queryTokens.length === 0) return 0;
  const contentTokens = new Set(normalizedTokens(content));
  const overlap = queryTokens.filter((token) => contentTokens.has(token)).length / queryTokens.length;
  return Math.min(1, overlap + (queryTokens.length > 1 && normalizedTokens(content).join(" ").includes(queryTokens.join(" ")) ? 0.25 : 0));
}

function combinedScore(vector: number[], embedding: number[], query: string | undefined, content: string): number {
  const semantic = cosine(vector, embedding);
  if (!query?.trim()) return semantic;
  return lexicalScore(query, content) * 0.75 + semantic * 0.25;
}
