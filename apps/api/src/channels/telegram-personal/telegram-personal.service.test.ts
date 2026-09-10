import { describe, expect, it } from "vitest";

import {
  buildTelegramQrUrl,
  isQrExpired,
  serializePersonalSession
} from "../../services/telegram-personal.service.js";

describe("Telegram personal QR login", () => {
  it("builds a tg login URL from the binary login token", () => {
    const token = new Uint8Array([1, 2, 255]);

    expect(buildTelegramQrUrl(token)).toBe("tg://login?token=AQL_");
  });

  it("marks a QR token expired at its expiry timestamp", () => {
    expect(isQrExpired(new Date("2026-09-09T00:00:30.000Z"), new Date("2026-09-09T00:00:30.000Z"))).toBe(true);
    expect(isQrExpired(new Date("2026-09-09T00:00:30.000Z"), new Date("2026-09-09T00:00:29.999Z"))).toBe(false);
  });

  it("encrypts a session payload before it is persisted", () => {
    const record = serializePersonalSession("session-secret-value");

    expect(record).not.toContain("session-secret-value");
    expect(record.split(".")).toHaveLength(4);
  });
});
