import { describe, expect, it } from "vitest";

import { assistantCreateSchema, assistantPatchSchema } from "./assistant.schemas.js";

describe("assistant schemas", () => {
  it("accepts a valid assistant and applies the fallback default", () => {
    expect(assistantCreateSchema.parse({
      name: "Tư vấn bán hàng",
      instructions: "Trả lời thân thiện",
      modelTier: "smart"
    })).toMatchObject({
      modelTier: "smart",
      fallbackMessage: "Mình sẽ chuyển bạn đến nhân viên hỗ trợ nhé."
    });
  });

  it("rejects an invalid tier and overlong name", () => {
    expect(assistantCreateSchema.safeParse({
      name: "a".repeat(101),
      instructions: "Hướng dẫn",
      modelTier: "turbo"
    }).success).toBe(false);
  });

  it("allows patch fields independently", () => {
    expect(assistantPatchSchema.parse({ enabled: false })).toEqual({ enabled: false });
  });
});
