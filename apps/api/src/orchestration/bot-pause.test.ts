import { describe, expect, it } from "vitest";
import { isBotPaused } from "./bot-pause.service.js";
describe("bot pause", () => {
  it("pauses only before the configured deadline", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    expect(isBotPaused(new Date(now.getTime() + 1), now)).toBe(true);
    expect(isBotPaused(new Date(now.getTime()), now)).toBe(false);
  });
});
