import { describe, expect, it } from "vitest";

import { canAccessInbox } from "./inbox-access.js";

describe("canAccessInbox", () => {
  it("allows customer accounts during the MVP phase", () => {
    expect(canAccessInbox("customer")).toBe(true);
  });
});
