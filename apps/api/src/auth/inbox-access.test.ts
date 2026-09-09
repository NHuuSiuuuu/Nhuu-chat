import { describe, expect, it } from "vitest";

import { inboxAccessRoles } from "./inbox-access.js";

describe("inboxAccessRoles", () => {
  it("includes customer during the MVP phase", () => {
    expect(inboxAccessRoles).toContain("customer");
  });
});
