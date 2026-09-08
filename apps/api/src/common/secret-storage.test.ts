import { describe, expect, it } from "vitest";

import { readEncryptedSecret, writeEncryptedSecret } from "./secret-storage.js";

process.env.ENCRYPTION_KEY ??= "test-encryption-key-that-is-at-least-32-characters";

describe("encrypted secret storage contract", () => {
  it("stores ciphertext at the persistence boundary and restores the secret", () => {
    const plaintext = "telegram-bot-token";
    const record = writeEncryptedSecret(plaintext);

    expect(record.secret).not.toBe(plaintext);
    expect(readEncryptedSecret(record)).toBe(plaintext);
  });
});
