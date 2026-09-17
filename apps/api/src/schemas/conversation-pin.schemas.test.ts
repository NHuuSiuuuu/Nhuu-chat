import { describe, expect, it } from "vitest";
import { chatEvents } from "@nhuu-chat/contracts";
import { conversationPinMessageIdSchema, conversationPinMessageSchema } from "./conversation-pin.schemas.js";

describe("conversation pin schemas", () => {
  it("accepts a non-empty message id for pinning", () => {
    expect(conversationPinMessageSchema.parse({ messageId: "message-1" })).toEqual({ messageId: "message-1" });
  });

  it("accepts a non-empty message id for unpinning", () => {
    expect(conversationPinMessageIdSchema.parse({ messageId: "message-1" })).toEqual({ messageId: "message-1" });
  });

  it.each([
    [conversationPinMessageSchema, "pinning"],
    [conversationPinMessageIdSchema, "unpinning"]
  ] as const)("rejects an empty message id when %s", (schema) => {
    expect(() => schema.parse({ messageId: "   " })).toThrow();
  });

  it("publishes the message pin update event name", () => {
    expect(chatEvents.messagePinUpdated).toBe("chat:message_pin_updated");
  });
});
