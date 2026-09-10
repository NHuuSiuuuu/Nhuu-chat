import { describe, expect, it } from "vitest";
import { registerSchema } from "./auth.schemas.js";
import { customerTagsSchema } from "./customers.schemas.js";
import { knowledgeInputSchema } from "./knowledge.schemas.js";
import { conversationTagInputSchema } from "./conversation-tag.schemas.js";

describe("HTTP schemas", () => {
  it("rejects a registration password shorter than eight characters", () => {
    expect(registerSchema.safeParse({ name: "A", email: "a@example.com", password: "short" }).success).toBe(false);
  });

  it("rejects customer tags that are not strings", () => {
    expect(customerTagsSchema.safeParse({ tags: ["vip", 3] }).success).toBe(false);
  });

  it("requires title and content for knowledge ingestion", () => {
    expect(knowledgeInputSchema.safeParse({ title: "", content: "" }).success).toBe(false);
  });

  it("accepts a valid conversation tag", () => {
    expect(conversationTagInputSchema.safeParse({ name: "Mua hàng", color: "#22c55e" }).success).toBe(true);
  });
});
