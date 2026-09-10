import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("MessageComposer accessibility", () => {
  it("keeps a visible focus ring on the message input", () => {
    const source = readFileSync(new URL("./MessageComposer.tsx", import.meta.url), "utf8");

    expect(source).toContain("focus-visible:ring-2");
    expect(source).toContain("focus-visible:ring-blue-300");
  });

  it("provides the prompt-defined multiline composer structure", () => {
    const source = readFileSync(new URL("./MessageComposer.tsx", import.meta.url), "utf8");

    expect(source).toContain("<textarea");
    expect(source).toContain("Shift+Enter để xuống dòng");
    expect(source).toContain('aria-label="Mở phím tắt"');
    expect(source).toContain('aria-label="Làm mới gợi ý AI"');
    expect(source).toContain('aria-label="Đính kèm hình ảnh"');
    expect(source).toContain('aria-label="Mở mẫu trả lời"');
  });

  it("defines keyboard shortcut behavior and the shortcut dialog", () => {
    const source = readFileSync(new URL("./MessageComposer.tsx", import.meta.url), "utf8");

    expect(source).toContain("isShortcutModalOpen");
    expect(source).toContain("onKeyDown");
    expect(source).toContain('event.key === "Enter"');
    expect(source).toContain('event.key === "/"');
    expect(source).toContain('event.key === "@"');
    expect(source).toContain('event.key === "Escape"');
    expect(source).toContain("Phím tắt &amp; Mẹo");
    expect(source).toContain("<kbd");
  });

  it("keeps the composer compact while preserving a multiline input", () => {
    const source = readFileSync(new URL("./MessageComposer.tsx", import.meta.url), "utf8");

    expect(source).toContain("mx-4 mb-3 mt-2");
    expect(source).toContain("rows={1}");
    expect(source).toContain("min-h-12");
  });
});
