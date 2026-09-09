import { describe, expect, it } from "vitest";
import { chunkText } from "./chunker.js";
describe("chunkText", () => {
  it("chunks with overlap and stable indexes", () => {
    expect(chunkText("abcdefghij", 5, 1)).toEqual([{ content: "abcde", chunkIndex: 0 }, { content: "efghi", chunkIndex: 1 }, { content: "ij", chunkIndex: 2 }]);
  });
});
