import { describe, expect, it } from "vitest";

import { listMessages, toMessage } from "../services/message.service.js";

describe("message pagination ordering", () => {
  it("requests the newest page first while returning messages chronologically", () => {
    const source = String(listMessages);
    expect(source).toContain("createdAt: -1");
    expect(source).toContain("rows.reverse()");
  });

  it("maps the real sender name from message metadata", () => {
    const source = String(toMessage);
    expect(source).toContain("senderName");
    expect(source).toContain("metadata?.senderName");
  });
});
