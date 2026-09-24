import { describe, expect, it } from "vitest";

import { UserModel } from "./user.model.js";

describe("User model", () => {
  it("defaults new accounts to customer and retains existing settings", () => {
    const user = new UserModel({ name: "Nhuu", email: "nhuu@example.com", passwordHash: "hash" });

    expect(user.role).toBe("customer");
    expect(user.aiSettings).toBeDefined();
    expect(user.generalSettings).toBeDefined();
  });
});
