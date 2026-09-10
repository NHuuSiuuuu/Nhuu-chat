import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { startTestDatabase, stopTestDatabase } from "../test/mongo-repl-set.js";
import { createProviderSecret, readProviderSecret } from "../services/provider-secret.service.js";
import { ProviderSecretModel } from "./provider-secret.model.js";

process.env.ENCRYPTION_KEY ??= "test-encryption-key-that-is-at-least-32-characters";

describe("provider secret persistence", () => {
  beforeAll(async () => {
    await startTestDatabase();
    await ProviderSecretModel.syncIndexes();
  }, 120_000);

  beforeEach(async () => {
    await ProviderSecretModel.deleteMany({});
  });

  afterAll(async () => {
    await stopTestDatabase();
  }, 30_000);

  it("stores ciphertext in Mongo and decrypts only at the service boundary", async () => {
    const plaintext = "telegram-provider-token";
    const created = await createProviderSecret("telegram", "bot-token", plaintext);
    const raw = await ProviderSecretModel.findById(created.id).select("+ciphertext").lean();

    expect(raw?.ciphertext).toBeTypeOf("string");
    expect(raw?.ciphertext).not.toContain(plaintext);
    expect(await readProviderSecret(created.id)).toBe(plaintext);
  });

  it("does not persist a plaintext secret field", async () => {
    await createProviderSecret("telegram", "webhook-secret", "sensitive-value");
    const raw = await ProviderSecretModel.findOne({ name: "webhook-secret" })
      .select("+ciphertext")
      .lean();

    expect(raw).not.toHaveProperty("secret");
    expect(JSON.stringify(raw)).not.toContain("sensitive-value");
  });
});
