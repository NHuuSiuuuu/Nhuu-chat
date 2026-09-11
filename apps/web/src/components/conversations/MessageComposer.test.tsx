import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as composerModule from "./MessageComposer";

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

  it("does not render static AI chips before an API response", () => {
    const source = readFileSync(new URL("./MessageComposer.tsx", import.meta.url), "utf8");

    expect(source).not.toContain("aiSuggestionSets");
    expect(source).not.toContain("aiSuggestionSetIndex");
    expect(source).toContain("getDisplayedAiSuggestions(aiSuggestions, isAiSuggestionsLoading)");
    expect(source).toContain('aria-label="Gợi ý AI"');
    expect(source).toContain("AI gợi ý");
  });

  it("keeps the refresh button as the only AI loading indicator", () => {
    const source = readFileSync(new URL("./MessageComposer.tsx", import.meta.url), "utf8");

    expect(source).not.toContain('AI gợi ý {isAiSuggestionsLoading &&');
    expect(source).not.toContain('isAiSuggestionsLoading && <span className="inline-flex animate-spin" aria-hidden="true">');
    expect(source).toContain('className={isAiSuggestionsLoading ? "inline-flex animate-spin" : "inline-flex"}');
    expect(source).toContain('aria-label="Gợi ý AI"');
    expect(source).toContain("getDisplayedAiSuggestions(aiSuggestions, isAiSuggestionsLoading)");
  });

  it("returns no displayed suggestions while loading or without API suggestions", () => {
    expect(typeof composerModule.getDisplayedAiSuggestions).toBe("function");

    if (typeof composerModule.getDisplayedAiSuggestions === "function") {
      expect(composerModule.getDisplayedAiSuggestions(["stale suggestion"], true)).toEqual([]);
      expect(composerModule.getDisplayedAiSuggestions(null, false)).toEqual([]);
      expect(composerModule.getDisplayedAiSuggestions([], false)).toEqual([]);
    }
  });

  it("renders AI chips only when API suggestions are available", () => {
    const source = readFileSync(new URL("./MessageComposer.tsx", import.meta.url), "utf8");

    expect(source).toContain("displayedAiSuggestions.length > 0");
  });

  it("returns API suggestions after loading resolves", () => {
    expect(typeof composerModule.getDisplayedAiSuggestions).toBe("function");

    if (typeof composerModule.getDisplayedAiSuggestions === "function") {
      const apiSuggestions = ["Gợi ý 1", "Gợi ý 2"];

      expect(composerModule.getDisplayedAiSuggestions(apiSuggestions, false)).toEqual(apiSuggestions);
    }
  });

  it("renders server suggestions with loading and non-blocking error states", () => {
    const source = readFileSync(new URL("./MessageComposer.tsx", import.meta.url), "utf8");

    expect(source).toContain("aiSuggestions?: string[]");
    expect(source).toContain("isAiSuggestionsLoading");
    expect(source).toContain("aiSuggestionsError");
    expect(source).toContain("onRefreshAiSuggestions");
    expect(source).toContain("disabled={isAiSuggestionsLoading}");
    expect(source).toContain("aiSuggestionsError &&");
  });

  it("keeps suggestion selection separate from sending", () => {
    const source = readFileSync(new URL("./MessageComposer.tsx", import.meta.url), "utf8");

    expect(source).toContain("setContent(value)");
    expect(source).toContain("onClick={() => selectSuggestion(suggestion)}");
    expect(source).toContain("onSend(content.trim())");
  });
});
