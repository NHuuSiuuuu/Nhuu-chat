import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
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
    expect(source).toContain('title="Phím tắt & hướng dẫn"');
    expect(source).toContain('title="Video và tài liệu"');
    expect(source).toContain('title="Hình ảnh"');
    expect(source).toContain('title="Mẫu trả lời nhanh"');
    expect(source).toContain('title="Gửi tin nhắn"');
  });

  it("provides separate bounded image and file upload controls", () => {
    const source = readFileSync(new URL("./MessageComposer.tsx", import.meta.url), "utf8");

    expect(source).toContain('accept="image/jpeg,image/png,image/gif,image/webp"');
    expect(source).toContain('.pdf,.doc,.docx,.xls,.xlsx,.zip');
    expect(source).toContain("20 MB");
    expect(source).toContain("selectedFile");
  });

  it("renders only the settings-managed conversation tags without an overflow area", () => {
    const source = readFileSync(new URL("./MessageComposer.tsx", import.meta.url), "utf8");

    expect(source).toContain("availableTags.map");
    expect(source).toContain("conversationTags");
    expect(source).not.toContain("fixedConversationTags");
    expect(source).not.toContain('"Câu hỏi"');
    expect(source).not.toContain("hiddenCount");
    expect(source).not.toContain("+{hiddenCount}");
    expect(source).not.toContain("Thẻ đang gắn");
  });

  it("wraps conversation tags when the composer becomes narrow", () => {
    const source = readFileSync(new URL("./MessageComposer.tsx", import.meta.url), "utf8");

    expect(source).toContain('className="flex w-full flex-wrap gap-1"');
    expect(source).not.toContain('className="flex w-full overflow-x-auto scrollbar-none"');
  });

  it("keeps conversation tags compact with the approved typography", () => {
    const source = readFileSync(new URL("./MessageComposer.tsx", import.meta.url), "utf8");

    expect(source).toContain("min-w-[92px] flex-1 px-2 py-1 text-[10px] font-normal");
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
    expect(source).toContain("onSend(selectedFile ?");
  });

  it("builds a backend quick-reply draft without sending it", () => {
    expect(typeof composerModule.createQuickReplyDraft).toBe("function");

    if (typeof composerModule.createQuickReplyDraft === "function") {
      expect(composerModule.createQuickReplyDraft({
        id: "reply-1",
        shortcut: "bao-gia",
        message: "Em gửi anh/chị bảng giá mới nhất ạ.",
        attachment: {
          secureUrl: "https://res.cloudinary.com/nhuu/image/upload/bang-gia.png",
          publicId: "quick-replies/bang-gia",
          resourceType: "image",
          mimeType: "image/png",
          bytes: 2048,
          width: 800,
          height: 600
        }
      })).toEqual({
        content: "Em gửi anh/chị bảng giá mới nhất ạ.",
        attachmentUrl: "https://res.cloudinary.com/nhuu/image/upload/bang-gia.png"
      });
    }
  });

  it("lists backend shortcuts and exposes the selected attachment URL", () => {
    const source = readFileSync(new URL("./MessageComposer.tsx", import.meta.url), "utf8");

    expect(source).toContain("quickReplies: QuickReplyContract[]");
    expect(source).toContain("quickReplies.map((reply, index)");
    expect(source).toContain("reply.shortcut");
    expect(source).toContain("reply.message");
    expect(source).toContain("selectedAttachmentUrl");
    expect(source).toContain("href={selectedAttachmentUrl}");
    expect(source).not.toContain('const quickReplies = [');
    expect(source).not.toContain("Xin chào, em có thể hỗ trợ gì cho anh/chị?");
  });

  it("opens slash suggestions and selects text plus attachment without sending", () => {
    expect(typeof composerModule.createComposerBehaviorState).toBe("function");
    expect(typeof composerModule.processComposerKey).toBe("function");

    if (typeof composerModule.createComposerBehaviorState === "function" && typeof composerModule.processComposerKey === "function") {
      const onSubmit = vi.fn();
      const quickReplies = [{
        id: "reply-1",
        shortcut: "bao-gia",
        message: "Em gửi anh/chị bảng giá mới nhất ạ.",
        attachment: {
          secureUrl: "https://res.cloudinary.com/nhuu/image/upload/bang-gia.png",
          publicId: "quick-replies/bang-gia",
          resourceType: "image" as const,
          mimeType: "image/png",
          bytes: 2048
        }
      }];

      const opened = composerModule.processComposerKey(composerModule.createComposerBehaviorState(), { key: "/", shiftKey: false }, quickReplies, onSubmit);
      const selected = composerModule.processComposerKey(opened.state, { key: "Enter", shiftKey: false }, quickReplies, onSubmit);

      expect(opened.state.suggestionKind).toBe("quick-reply");
      expect(selected).toEqual({
        state: {
          content: "Em gửi anh/chị bảng giá mới nhất ạ.",
          attachmentUrl: "https://res.cloudinary.com/nhuu/image/upload/bang-gia.png",
          suggestionKind: null,
          suggestionIndex: 0
        },
        preventDefault: true
      });
      expect(onSubmit).not.toHaveBeenCalled();
    }
  });

  it("consumes Enter without sending when slash suggestions are empty", () => {
    expect(typeof composerModule.createComposerBehaviorState).toBe("function");
    expect(typeof composerModule.processComposerKey).toBe("function");

    if (typeof composerModule.createComposerBehaviorState === "function" && typeof composerModule.processComposerKey === "function") {
      const onSubmit = vi.fn();
      const opened = composerModule.processComposerKey(composerModule.createComposerBehaviorState("/"), { key: "/", shiftKey: false }, [], onSubmit);
      const consumed = composerModule.processComposerKey(opened.state, { key: "Enter", shiftKey: false }, [], onSubmit);

      expect(consumed.preventDefault).toBe(true);
      expect(consumed.state.content).toBe("/");
      expect(consumed.state.suggestionKind).toBe("quick-reply");
      expect(onSubmit).not.toHaveBeenCalled();
    }
  });

  it("preserves wraparound keyboard navigation and Escape closing", () => {
    expect(typeof composerModule.createComposerBehaviorState).toBe("function");
    expect(typeof composerModule.processComposerKey).toBe("function");

    if (typeof composerModule.createComposerBehaviorState === "function" && typeof composerModule.processComposerKey === "function") {
      const quickReplies = [
        { id: "reply-1", shortcut: "mot", message: "Một" },
        { id: "reply-2", shortcut: "hai", message: "Hai" }
      ];
      const onSubmit = vi.fn();
      const opened = composerModule.processComposerKey(composerModule.createComposerBehaviorState(), { key: "/", shiftKey: false }, quickReplies, onSubmit);
      const movedDown = composerModule.processComposerKey(opened.state, { key: "ArrowDown", shiftKey: false }, quickReplies, onSubmit);
      const wrappedByTab = composerModule.processComposerKey(movedDown.state, { key: "Tab", shiftKey: false }, quickReplies, onSubmit);
      const wrappedUp = composerModule.processComposerKey(wrappedByTab.state, { key: "ArrowUp", shiftKey: false }, quickReplies, onSubmit);
      const closed = composerModule.processComposerKey(wrappedUp.state, { key: "Escape", shiftKey: false }, quickReplies, onSubmit);

      expect(movedDown.state.suggestionIndex).toBe(1);
      expect(wrappedByTab.state.suggestionIndex).toBe(0);
      expect(wrappedUp.state.suggestionIndex).toBe(1);
      expect(closed.state.suggestionKind).toBeNull();
      expect(onSubmit).not.toHaveBeenCalled();
    }
  });

  it("closes slash suggestions when the slash-triggered content is deleted", () => {
    expect(typeof composerModule.syncComposerContent).toBe("function");

    if (typeof composerModule.syncComposerContent === "function") {
      const state = {
        ...composerModule.createComposerBehaviorState("/"),
        suggestionKind: "quick-reply" as const
      };

      expect(composerModule.syncComposerContent(state, "")).toEqual({
        ...state,
        content: "",
        suggestionKind: null
      });
    }
  });

  it("closes slash suggestions when clicking outside the composer", () => {
    const source = readFileSync(new URL("./MessageComposer.tsx", import.meta.url), "utf8");

    expect(source).toContain("document.addEventListener(\"pointerdown\"");
    expect(source).toContain("composerRef.current?.contains");
    expect(source).toContain("setSuggestionKind(null)");
  });
});
