import { describe, expect, it } from "vitest";
import { conversationBulkActionSchema } from "./conversation.schemas.js";

describe("conversation bulk action schema", () => {
  it("accepts unique valid ids and supported actions", () => {
    expect(conversationBulkActionSchema.safeParse({ action: "read", conversationIds: ["507f1f77bcf86cd799439011"] }).success).toBe(true);
  });

  it("rejects empty, oversized, duplicate, malformed, and unsupported requests", () => {
    expect(conversationBulkActionSchema.safeParse({ action: "read", conversationIds: [] }).success).toBe(false);
    expect(conversationBulkActionSchema.safeParse({ action: "read", conversationIds: Array(101).fill("507f1f77bcf86cd799439011") }).success).toBe(false);
    expect(conversationBulkActionSchema.safeParse({ action: "delete", conversationIds: ["507f1f77bcf86cd799439011", "507f1f77bcf86cd799439011"] }).success).toBe(false);
    expect(conversationBulkActionSchema.safeParse({ action: "read", conversationIds: ["not-an-object-id"] }).success).toBe(false);
    expect(conversationBulkActionSchema.safeParse({ action: "archive", conversationIds: ["507f1f77bcf86cd799439011"] }).success).toBe(false);
  });
});
