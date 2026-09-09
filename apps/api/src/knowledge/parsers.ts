const allowedMimeTypes = new Set(["text/plain", "text/markdown"]);

export function parseKnowledgeText(input: { mimeType: string; content: string }): string {
  if (!allowedMimeTypes.has(input.mimeType)) throw new Error("Unsupported knowledge MIME type");
  return input.content.trim();
}
