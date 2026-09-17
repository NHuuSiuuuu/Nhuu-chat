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

  it("maps the outbound client correlation id from message metadata", () => {
    expect(toMessage({
      _id: "server-1",
      conversationId: "conversation-1",
      platform: "zalo_personal",
      senderType: "agent",
      senderId: "agent-1",
      type: "text",
      content: "Xin chào",
      deliveryStatus: "sent",
      createdAt: "2026-09-17T07:00:00.000Z",
      metadata: { clientMessageId: "client-1" }
    })).toMatchObject({ clientMessageId: "client-1" });
  });
});
