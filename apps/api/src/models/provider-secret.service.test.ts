import { afterEach, describe, expect, it, vi } from "vitest";

import { buildProviderSecretDocument } from "./provider-secret.service.js";

process.env.ENCRYPTION_KEY ??= "test-encryption-key-that-is-at-least-32-characters";

describe("provider secret logging boundary", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("never emits the provider plaintext while building a persistence document", () => {
    const plaintext = "provider-token-that-must-not-be-logged";
    const logs = [
      vi.spyOn(console, "log").mockImplementation(() => undefined),
      vi.spyOn(console, "warn").mockImplementation(() => undefined),
      vi.spyOn(console, "error").mockImplementation(() => undefined)
    ];

    const document = buildProviderSecretDocument("telegram", "bot-token", plaintext);
    const emitted = logs.flatMap((log) => log.mock.calls.flat());

    expect(document.ciphertext).not.toBe(plaintext);
    expect(emitted).not.toContain(plaintext);
  });
});
