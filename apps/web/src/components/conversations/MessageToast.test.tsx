import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as toastModule from "./MessageToast.js";

describe("incoming message toast", () => {
  it("provides a reusable development notice toast", () => {
    expect(typeof toastModule.DevelopmentToast).toBe("function");
  });

  it("keeps only the latest three unique notifications", () => {
    expect(typeof toastModule.appendMessageToast).toBe("function");

    if (typeof toastModule.appendMessageToast === "function") {
      const first = { id: "message-1", conversationId: "conversation-1", senderName: "A", content: "Một", platform: "telegram" as const };
      const second = { ...first, id: "message-2", content: "Hai" };
      const third = { ...first, id: "message-3", content: "Ba" };
      const fourth = { ...first, id: "message-4", content: "Bốn" };

      expect(toastModule.appendMessageToast([first, second, third], first)).toEqual([first, second, third]);
      expect(toastModule.appendMessageToast([first, second, third], fourth)).toEqual([second, third, fourth]);
    }
  });

  it("uses local platform branding and an automatic five-second dismissal", () => {
    const source = readFileSync(new URL("./MessageToast.tsx", import.meta.url), "utf8");

    expect(source).toContain("PlatformIcon");
    expect(source).toContain("setTimeout");
    expect(source).toContain("5000");
    expect(source).toContain("toast-progress");
  });

  it("renders the platform logo as a plain SVG without a circular background", () => {
    const source = readFileSync(new URL("./MessageToast.tsx", import.meta.url), "utf8");

    expect(source).toContain("plain");
    expect(source).toContain("<PlatformIcon provider={platformIconProvider(toast.platform)} size={16} plain />");
  });
});
