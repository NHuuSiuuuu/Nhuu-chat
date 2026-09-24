import { describe, expect, it } from "vitest";

import { workspaceMemberPatchSchema, workspaceMemberSchema } from "./workspace.schemas.js";

describe("workspace member schemas", () => {
  it("accepts only registered email, admin/staff role, and unique Page ids", () => {
    expect(workspaceMemberSchema.parse({
      email: " staff@example.com ", role: "staff", allowedPages: ["page-1", "page-1"]
    })).toEqual({ email: "staff@example.com", role: "staff", allowedPages: ["page-1"] });
  });

  it("rejects owner assignment and empty updates", () => {
    expect(workspaceMemberSchema.safeParse({ email: "owner@example.com", role: "owner" }).success).toBe(false);
    expect(workspaceMemberPatchSchema.safeParse({}).success).toBe(false);
  });
});
