import { describe, expect, it } from "vitest";
import { toggleConversationSelection, toggleVisibleConversationSelection } from "./conversation-selection.js";

describe("conversation selection", () => {
  it("adds and removes an individual conversation without duplicates", () => {
    expect(toggleConversationSelection(["a"], "b", true)).toEqual(["a", "b"]);
    expect(toggleConversationSelection(["a", "a"], "a", false)).toEqual([]);
  });

  it("selects or clears only the currently visible conversations", () => {
    expect(toggleVisibleConversationSelection(["hidden"], ["a", "b"], true)).toEqual(["hidden", "a", "b"]);
    expect(toggleVisibleConversationSelection(["hidden", "a"], ["a", "b"], false)).toEqual([]);
  });
});
