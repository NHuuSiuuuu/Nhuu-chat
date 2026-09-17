import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getMessageDeliveryState } from "./ChatWindow.js";

describe("ChatWindow delivery indicator", () => {
  it.each([
    ["pending", "sending"],
    ["sent", "sent"],
    ["delivered", "sent"],
    ["failed", "failed"]
  ] as const)("maps %s to the %s UI state", (status, expected) => {
    expect(getMessageDeliveryState(status)).toBe(expected);
  });

  it("renders visible status indicators and attachment overlays", () => {
    const source = readFileSync(new URL("./ChatWindow.tsx", import.meta.url), "utf8");

    expect(source).toContain("animate-spin");
    expect(source).toContain('aria-label="Đang gửi tin nhắn"');
    expect(source).toContain('aria-label="Gửi lại tin nhắn"');
    expect(source).toContain("bottom-1 -right-5");
    expect(source).not.toContain("bottom-1 right-1");
    expect(source).toContain("relative");
    expect(source).toContain("MessageDeliveryIndicator");
    expect(source).toContain("message.attachments");
  });
});
