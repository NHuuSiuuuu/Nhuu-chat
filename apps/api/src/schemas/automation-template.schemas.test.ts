import { describe, expect, it } from "vitest";

import {
  automationTemplateCreateSchema,
  automationTemplatePatchSchema
} from "./automation-template.schemas.js";

describe("automation template schemas", () => {
  it("trims and deduplicates keywords", () => {
    expect(automationTemplateCreateSchema.parse({
      name: "Giá sản phẩm",
      keywords: [" giá ", "GIÁ", "giá"],
      responseTemplate: "Sản phẩm có giá từ 100.000đ.",
      assistantId: "507f1f77bcf86cd799439011"
    }).keywords).toEqual(["giá"]);
  });

  it("requires at least one non-empty keyword and limits content", () => {
    expect(automationTemplateCreateSchema.safeParse({
      name: "Mẫu",
      keywords: [" ", ""],
      responseTemplate: "Trả lời"
    }).success).toBe(false);
    expect(automationTemplateCreateSchema.safeParse({
      name: "Mẫu",
      keywords: ["ok"],
      responseTemplate: "a".repeat(2001)
    }).success).toBe(false);
  });

  it("allows patch fields independently", () => {
    expect(automationTemplatePatchSchema.parse({ priority: 5 })).toEqual({ priority: 5 });
  });
});
