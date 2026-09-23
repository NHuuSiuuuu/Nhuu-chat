import { describe, expect, it } from "vitest";

import {
  conversationListQuerySchema,
  conversationStatusSchema
} from "./conversation.schemas.js";
import { messageListQuerySchema, outboundMessageSchema } from "./message.schemas.js";

describe("conversation and message HTTP schemas", () => {
  it("accepts omitted conversation pagination values", () => {
    expect(conversationListQuerySchema.safeParse({}).success).toBe(true);
  });

  it("rejects conversation page zero", () => {
    expect(conversationListQuerySchema.safeParse({ page: "0" }).success).toBe(false);
  });

  it("accepts a channel ID when filtering conversations", () => {
    expect(conversationListQuerySchema.parse({ platform: "facebook", channelId: "page-42" })).toEqual({
      platform: "facebook",
      channelId: "page-42"
    });
  });

  it("accepts omitted message pagination values", () => {
    expect(messageListQuerySchema.safeParse({}).success).toBe(true);
  });

  it("rejects message page zero", () => {
    expect(messageListQuerySchema.safeParse({ page: "0" }).success).toBe(false);
  });

  it.each(["open", "pending", "closed"])("accepts the %s conversation status", (status) => {
    expect(conversationStatusSchema.safeParse({ status }).success).toBe(true);
  });

  it("rejects unsupported conversation statuses", () => {
    expect(conversationStatusSchema.safeParse({ status: "archived" }).success).toBe(false);
  });

  it("requires a string conversation id for outbound messages", () => {
    expect(outboundMessageSchema.safeParse({ conversationId: 42, type: "text", content: "Hello" }).success).toBe(false);
  });

  it("accepts image and file outbound message types", () => {
    expect(outboundMessageSchema.safeParse({ conversationId: "conversation-1", type: "image", content: "Hello" }).success).toBe(true);
    expect(outboundMessageSchema.safeParse({ conversationId: "conversation-1", type: "file", content: "" }).success).toBe(true);
  });
});
