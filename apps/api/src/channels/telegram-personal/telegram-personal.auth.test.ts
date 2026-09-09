import { describe, expect, it } from "vitest";

import { createPasswordPrompt, isRetryableTelegramPasswordError, shouldReusePendingQr } from "./telegram-personal.auth.js";

describe("Telegram personal 2FA prompt", () => {
  it("waits for the password submitted by the owner and exposes the hint", async () => {
    const prompt = createPasswordPrompt();
    const passwordPromise = prompt.ask("Use your Telegram password");

    expect(prompt.hint).toBe("Use your Telegram password");

    prompt.submit("correct-telegram-password");

    await expect(passwordPromise).resolves.toBe("correct-telegram-password");
  });

  it("keeps the login flow alive when Telegram rejects the password", () => {
    expect(isRetryableTelegramPasswordError({ errorMessage: "PASSWORD_HASH_INVALID" })).toBe(true);
    expect(isRetryableTelegramPasswordError({ errorMessage: "AUTH_KEY_UNREGISTERED" })).toBe(false);
  });

  it("does not reuse a stale password-required QR session", () => {
    expect(shouldReusePendingQr("waiting")).toBe(true);
    expect(shouldReusePendingQr("password_required")).toBe(false);
  });
});
