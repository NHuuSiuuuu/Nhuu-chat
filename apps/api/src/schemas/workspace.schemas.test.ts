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

  it("accepts unique multi-platform channel references and rejects personal platforms", () => {
    expect(workspaceMemberSchema.parse({
      email: "staff@example.com", role: "staff", allowedChannels: [
        { platform: "facebook", channelId: "same-id" },
        { platform: "telegram", channelId: "same-id" },
        { platform: "telegram", channelId: "same-id" }
      ]
    }).allowedChannels).toEqual([
      { platform: "facebook", channelId: "same-id" },
      { platform: "telegram", channelId: "same-id" }
    ]);
    expect(workspaceMemberSchema.safeParse({ email: "staff@example.com", role: "staff", allowedChannels: [
      { platform: "zalo_personal", channelId: "personal" }
    ] }).success).toBe(false);
  });
});
