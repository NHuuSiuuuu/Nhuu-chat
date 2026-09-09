import { describe, expect, it } from "vitest";
import { parseKnowledgeFile, parseKnowledgeText } from "./parsers.js";

describe("knowledge parsers", () => {
  it("accepts text and markdown only through the text parser", () => {
    expect(parseKnowledgeText({ mimeType: "text/markdown", content: " hello " })).toBe("hello");
    expect(() => parseKnowledgeText({ mimeType: "text/html", content: "<p>no</p>" })).toThrow("Unsupported");
  });
  it("rejects unsupported binary formats", async () => {
    await expect(parseKnowledgeFile({ mimeType: "application/zip", data: Buffer.from([]) })).rejects.toThrow("Unsupported");
  });
});
