import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import * as composer from "./MessageComposer.js";

const replies = Array.from({ length: 60 }, (_, index) => ({
  id: `reply-${index}`, shortcut: `shortcut-${index}`, message: `Reply ${index}`
}));

describe("long composer quick reply menus", () => {
  it("renders a bounded scrolling list with the keyboard-selected option marked active", () => {
    expect(composer.ComposerSuggestionMenu).toBeTypeOf("function");
    const html = renderToStaticMarkup(<composer.ComposerSuggestionMenu
      kind="quick-reply" quickReplies={replies} activeIndex={59}
      onQuickReply={vi.fn()} onMember={vi.fn()}
    />);
    expect(html).toMatch(/class="[^"]*max-h-64[^"]*overflow-y-auto/);
    expect(html.match(/role="option"/g)).toHaveLength(60);
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-selected="true"[^>]*><span[^>]*>\/shortcut-59<\/span>/);
  });

  it("scrolls the active option into view when navigation reaches or wraps a long list", () => {
    expect(composer.scrollActiveComposerOption).toBeTypeOf("function");
    const onSend = vi.fn();
    let state = { ...composer.createComposerBehaviorState(), suggestionKind: "quick-reply" as const };
    const scrolled: number[] = [];
    const menu = {
      querySelector: vi.fn((selector: string) => {
        expect(selector).toBe('[role="option"][aria-selected="true"]');
        return { scrollIntoView: (options: ScrollIntoViewOptions) => {
          expect(options).toEqual({ block: "nearest" });
          scrolled.push(state.suggestionIndex);
        } };
      })
    };
    for (const key of ["ArrowUp", "ArrowDown", "Tab"]) {
      state = composer.processComposerKey(state, { key, shiftKey: false }, replies, onSend).state as typeof state;
      composer.scrollActiveComposerOption(menu as unknown as HTMLDivElement);
    }
    expect(scrolled).toEqual([59, 0, 1]);
    expect(onSend).not.toHaveBeenCalled();
    expect(() => composer.scrollActiveComposerOption(null)).not.toThrow();
    expect(() => composer.scrollActiveComposerOption({ querySelector: () => null } as unknown as HTMLDivElement)).not.toThrow();
  });

  it("runs active visibility after rendering changes to the menu or keyboard index", () => {
    const source = readFileSync(new URL("./MessageComposer.tsx", import.meta.url), "utf8");
    expect(source).toContain("scrollActiveComposerOption(menuRef.current)");
    expect(source).toContain("[kind, activeIndex, quickReplies]");
    expect(source).toContain("ref={menuRef}");
    expect(source).toContain("activeIndex={suggestionIndex}");
  });
});
