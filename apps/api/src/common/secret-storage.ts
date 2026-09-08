import { decryptSecret, encryptSecret } from "./crypto.js";

export interface EncryptedSecretRecord {
  secret: string;
}

export function writeEncryptedSecret(value: string): EncryptedSecretRecord {
  return { secret: encryptSecret(value) };
}

export function readEncryptedSecret(record: EncryptedSecretRecord): string {
  return decryptSecret(record.secret);
}
