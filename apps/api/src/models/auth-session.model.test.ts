import { describe, expect, it } from "vitest";

import { AuthSessionModel } from "./auth-session.model.js";

describe("AuthSessionModel", () => {
  it("indexes session identity, owner lookup, and expiry cleanup", () => {
    const indexes = AuthSessionModel.schema.indexes();

    expect(indexes).toContainEqual([{ sessionId: 1 }, { unique: true }]);
    expect(indexes.some(([keys]) => keys.userId === 1)).toBe(true);
    expect(indexes).toContainEqual([{ expiresAt: 1 }, { expireAfterSeconds: 0 }]);
  });

  it("does not select refresh hashes by default", () => {
    expect(AuthSessionModel.schema.path("refreshTokenHash")?.options.select).toBe(false);
  });
});
