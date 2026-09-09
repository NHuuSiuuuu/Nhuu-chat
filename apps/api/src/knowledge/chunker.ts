export interface KnowledgeChunkInput {
  content: string;
  chunkIndex: number;
}

export function chunkText(input: string, maxChars: number, overlap: number): KnowledgeChunkInput[] {
  if (!Number.isInteger(maxChars) || maxChars < 1) throw new Error("maxChars must be positive");
  if (!Number.isInteger(overlap) || overlap < 0 || overlap >= maxChars) throw new Error("overlap must be in range");
  const text = input.trim();
  if (!text) return [];
  const chunks: KnowledgeChunkInput[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(text.length, start + maxChars);
    chunks.push({ content: text.slice(start, end).trim(), chunkIndex: chunks.length });
    if (end === text.length) break;
    start = end - overlap;
  }
  return chunks.filter((chunk) => chunk.content.length > 0);
}
