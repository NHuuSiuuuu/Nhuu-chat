import { describe, expect, it } from "vitest";

import { decryptSecret, encryptSecret } from "./crypto.js";

process.env.ENCRYPTION_KEY ??= "test-encryption-key-that-is-at-least-32-characters";

describe("secret encryption", () => {
  it("round-trips a secret without including plaintext in the ciphertext", () => {
    const plaintext = "telegram-token-super-secret";

    const encrypted = encryptSecret(plaintext);

    expect(encrypted).not.toContain(plaintext);
    expect(decryptSecret(encrypted)).toBe(plaintext);
  });

  it("rejects an authenticated ciphertext that has been modified", () => {
    const encrypted = encryptSecret("provider-secret");
    const parts = encrypted.split(".");
    parts[3] = `${parts[3]?.slice(0, -1)}${parts[3]?.endsWith("A") ? "B" : "A"}`;

    expect(() => decryptSecret(parts.join("."))).toThrow();
  });
});
