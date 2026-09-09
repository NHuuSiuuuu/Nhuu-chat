import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("MessageComposer accessibility", () => {
  it("keeps a visible focus ring on the message input", () => {
    const source = readFileSync(new URL("./MessageComposer.tsx", import.meta.url), "utf8");

    expect(source).toContain("focus-visible:ring-2");
    expect(source).toContain("focus-visible:ring-blue-300");
  });
});
