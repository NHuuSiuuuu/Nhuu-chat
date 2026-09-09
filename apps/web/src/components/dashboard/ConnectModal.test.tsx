import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("ConnectModal Tailwind migration", () => {
  it("removes handwritten modal stylesheet imports", () => {
    const source = readFileSync(new URL("./ConnectModal.tsx", import.meta.url), "utf8");

    expect(source).not.toMatch(/ConnectModal(V2)?\.css/);
    expect(source).toContain('role="dialog"');
    expect(source).toContain("grid");
  });

  it("renders an explicit failed QR state with its error", () => {
    const source = readFileSync(new URL("./ConnectModal.tsx", import.meta.url), "utf8");

    expect(source).toContain('qr?.status === "failed"');
    expect(source).toContain("qr.error");
    expect(source).toContain("onClick={onStart}");
  });
});
