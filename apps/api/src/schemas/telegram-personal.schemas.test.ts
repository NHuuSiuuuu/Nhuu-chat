import { describe, expect, it } from "vitest";

import {
  telegramPersonalQrIdSchema,
  telegramPersonalQrPasswordSchema
} from "./telegram-personal.schemas.js";

describe("Telegram personal HTTP schemas", () => {
  it("rejects a blank Telegram 2FA password", () => {
    expect(telegramPersonalQrPasswordSchema.safeParse({ password: "   " }).success).toBe(false);
  });

  it("rejects a non-string QR login id", () => {
    expect(telegramPersonalQrIdSchema.safeParse({ id: 123 }).success).toBe(false);
  });

  it("accepts a string QR login id without changing it", () => {
    expect(telegramPersonalQrIdSchema.parse({ id: "  qr-1  " })).toEqual({ id: "  qr-1  " });
  });

  it("accepts a valid Telegram 2FA password body without changing the password", () => {
    expect(telegramPersonalQrPasswordSchema.parse({ password: "  secret phrase  " })).toEqual({
      password: "  secret phrase  "
    });
  });
});
