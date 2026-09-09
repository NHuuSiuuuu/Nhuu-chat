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
    expect(source).toContain('qr.error && <p className="text-xs text-rose-600" role="alert">{qr.error}</p>');
    expect(source).toContain("max-h-[calc(100vh-2rem)]");
    expect(source).toContain("overflow-y-auto");
    expect(source).toContain("KeyboardEvent");
    expect(source).toContain("autoFocus");
    expect(source).toContain("closeButtonRef");
  });
});
