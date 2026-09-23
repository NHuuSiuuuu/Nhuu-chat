import mongoose from "mongoose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUser: vi.fn(),
  updateUser: vi.fn(),
  saveToken: vi.fn(),
  consumeToken: vi.fn(),
  removeToken: vi.fn(),
  sendEmail: vi.fn()
}));

vi.mock("../models/user.model.js", () => ({
  UserModel: {
    findOne: mocks.findUser,
    updateOne: mocks.updateUser
  }
}));
vi.mock("../models/password-reset-token.model.js", () => ({
  PasswordResetTokenModel: {
    findOneAndUpdate: mocks.saveToken,
    findOneAndDelete: mocks.consumeToken,
    deleteOne: mocks.removeToken
  }
}));
vi.mock("./password-reset-email.service.js", () => ({ sendPasswordResetEmail: mocks.sendEmail }));

import { verifyPassword } from "./auth.service.js";
import { requestPasswordReset, resetPassword } from "./password-reset.service.js";

function queryResult<T>(result: T) {
  return { select: vi.fn().mockResolvedValue(result) };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("password reset service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("WEB_APP_URL", "https://app.example.com");
  });

  it("does not create or send a token for an unknown email", async () => {
    mocks.findUser.mockReturnValue(queryResult(null));

    await expect(requestPasswordReset(" nobody@example.com ")).resolves.toBeUndefined();

    expect(mocks.findUser).toHaveBeenCalledWith({ email: "nobody@example.com" });
    expect(mocks.saveToken).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("stores only a digest and emails a new thirty-minute token", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-23T00:00:00.000Z"));
    mocks.findUser.mockReturnValue(queryResult({ _id: "user-1", email: "member@example.com" }));
    mocks.saveToken.mockResolvedValue(undefined);

    await requestPasswordReset(" MEMBER@example.com ");

    const emailCall = mocks.sendEmail.mock.calls[0];
    const sentUrl = emailCall?.[1] as string;
    const rawToken = new URL(sentUrl).searchParams.get("token");
    const [, update, options] = mocks.saveToken.mock.calls[0] as [unknown, { $set: { tokenHash: string; expiresAt: Date } }, unknown];
    expect(sentUrl).toMatch(/^https:\/\/app\.example\.com\/reset-password\?token=/);
    expect(rawToken).toMatch(/^[a-f0-9]{64}$/);
    expect(update.$set.tokenHash).toHaveLength(64);
    expect(update.$set.tokenHash).not.toBe(rawToken);
    expect(update.$set.expiresAt.toISOString()).toBe("2026-09-23T00:30:00.000Z");
    expect(mocks.saveToken.mock.calls[0]?.[0]).toEqual({ userId: "user-1" });
    expect(options).toMatchObject({ upsert: true, returnDocument: "after", includeResultMetadata: false });
    vi.useRealTimers();
  });

  it("keeps the generic success response and invalidates the token if email delivery fails", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.findUser.mockReturnValue(queryResult({ _id: "user-1", email: "member@example.com" }));
    mocks.saveToken.mockResolvedValue(undefined);
    mocks.sendEmail.mockRejectedValue(new Error("provider failure"));
    mocks.removeToken.mockResolvedValue({ deletedCount: 1 });

    await expect(requestPasswordReset("member@example.com")).resolves.toBeUndefined();

    expect(mocks.removeToken).toHaveBeenCalledWith({ userId: "user-1", tokenHash: expect.any(String) });
    expect(errorLog).toHaveBeenCalledWith("PASSWORD_RESET_REQUEST_FAILED");
  });

  it("keeps the generic success response when the reset URL configuration is missing", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubEnv("WEB_APP_URL", "");
    mocks.findUser.mockReturnValue(queryResult({ _id: "user-1", email: "member@example.com" }));

    await expect(requestPasswordReset("member@example.com")).resolves.toBeUndefined();

    expect(mocks.saveToken).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalledWith("PASSWORD_RESET_REQUEST_FAILED");
  });

  it("changes the password and consumes a valid token once", async () => {
    const startSession = vi.spyOn(mongoose, "startSession").mockResolvedValue({
      withTransaction: async (operation: () => Promise<void>) => operation(),
      endSession: vi.fn()
    } as never);
    const tokenHash = "49e2e40e591e61357758299c8cee170fb9fa7da160ec8acf110a4a409d905aaf";
    mocks.consumeToken.mockResolvedValue({ userId: "user-1" });
    mocks.updateUser.mockResolvedValue({ matchedCount: 1 });

    await resetPassword("known-token", "new-password-123");

    expect(startSession).toHaveBeenCalledOnce();
    expect(mocks.consumeToken).toHaveBeenCalledWith({ tokenHash, expiresAt: { $gt: expect.any(Date) } }, expect.any(Object));
    const [, update] = mocks.updateUser.mock.calls[0] as [unknown, { $set: { passwordHash: string; refreshTokenHash: null } }];
    expect(await verifyPassword(update.$set.passwordHash, "new-password-123")).toBe(true);
    expect(update.$set.refreshTokenHash).toBeNull();
  });

  it("returns the same invalid-token error when a token is missing or already consumed", async () => {
    vi.spyOn(mongoose, "startSession").mockResolvedValue({
      withTransaction: async (operation: () => Promise<void>) => operation(),
      endSession: vi.fn()
    } as never);
    mocks.consumeToken.mockResolvedValue(null);

    await expect(resetPassword("bad-token", "new-password-123")).rejects.toMatchObject({
      statusCode: 400,
      code: "INVALID_RESET_TOKEN",
      message: "Reset link is invalid or expired"
    });
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });
});
