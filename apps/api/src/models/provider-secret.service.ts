import { AppError } from "../common/errors.js";
import { readEncryptedSecret, writeEncryptedSecret } from "../common/secret-storage.js";
import { ProviderSecretModel } from "./provider-secret.model.js";

export function buildProviderSecretDocument(provider: string, name: string, plaintext: string) {
  const encrypted = writeEncryptedSecret(plaintext);
  return { provider, name, ciphertext: encrypted.secret };
}

export async function createProviderSecret(
  provider: string,
  name: string,
  plaintext: string
) {
  return ProviderSecretModel.create(buildProviderSecretDocument(provider, name, plaintext));
}

export async function readProviderSecret(id: string): Promise<string> {
  const record = await ProviderSecretModel.findById(id).select("+ciphertext");
  if (!record) throw new AppError(404, "SECRET_NOT_FOUND", "Secret was not found");

  return readEncryptedSecret({ secret: record.ciphertext });
}
