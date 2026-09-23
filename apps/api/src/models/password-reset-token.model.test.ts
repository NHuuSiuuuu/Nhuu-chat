import { describe, expect, it } from "vitest";

import { PasswordResetTokenModel } from "./password-reset-token.model.js";

describe("PasswordResetTokenModel", () => {
  it("enforces one token per user and expires records by expiresAt", () => {
    const indexes = PasswordResetTokenModel.schema.indexes();

    expect(indexes).toContainEqual([{ userId: 1 }, { unique: true }]);
    expect(indexes).toContainEqual([{ tokenHash: 1 }, { unique: true }]);
    expect(indexes).toContainEqual([{ expiresAt: 1 }, { expireAfterSeconds: 0 }]);
  });
});
