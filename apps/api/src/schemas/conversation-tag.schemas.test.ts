import { describe, expect, it } from "vitest";

import { conversationTagInputSchema, conversationTagUpdateSchema } from "./conversation-tag.schemas.js";

describe("conversation tag schemas", () => {
  it("accepts a trimmed name and six-digit hex color", () => {
    expect(conversationTagInputSchema.safeParse({ name: "  Mua hàng  ", color: "#22c55e" }).success).toBe(true);
  });

  it("rejects blank names and non-hex colors", () => {
    expect(conversationTagInputSchema.safeParse({ name: "   ", color: "red" }).success).toBe(false);
  });

  it("allows partial updates but requires at least one field", () => {
    expect(conversationTagUpdateSchema.safeParse({ color: "#ffffff" }).success).toBe(true);
    expect(conversationTagUpdateSchema.safeParse({}).success).toBe(false);
  });
});
