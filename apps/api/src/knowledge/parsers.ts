import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";

const allowedMimeTypes = new Set(["text/plain", "text/markdown"]);

export function parseKnowledgeText(input: { mimeType: string; content: string }): string {
  if (!allowedMimeTypes.has(input.mimeType)) throw new Error("Unsupported knowledge MIME type");
  return input.content.trim();
}

export async function parseKnowledgeFile(input: { mimeType: string; data: Buffer }): Promise<string> {
  if (allowedMimeTypes.has(input.mimeType)) return input.data.toString("utf8").trim();
  if (input.mimeType === "application/pdf") {
    const parser = new PDFParse({ data: input.data });
    try { return (await parser.getText()).text.trim(); } finally { await parser.destroy(); }
  }
  if (input.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    return (await mammoth.extractRawText({ buffer: input.data })).value.trim();
  }
  throw new Error("Unsupported knowledge MIME type");
}
