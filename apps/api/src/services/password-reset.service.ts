import { createHash, randomBytes } from "node:crypto";
import mongoose from "mongoose";

import { AppError } from "../common/errors.js";
import { PasswordResetTokenModel } from "../models/password-reset-token.model.js";
import { UserModel } from "../models/user.model.js";
import { sendPasswordResetEmail } from "./password-reset-email.service.js";
import { hashPassword } from "./auth.service.js";

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

function digestToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Trả im lặng với email chưa đăng ký để endpoint không xác nhận tài khoản có tồn tại.
export async function requestPasswordReset(email: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await UserModel.findOne({ email: normalizedEmail } as never).select("_id email");
  if (!user) return;

  const webAppUrl = process.env.WEB_APP_URL?.replace(/\/$/, "");
  let tokenHash: string | undefined;
  try {
    if (!webAppUrl) throw new Error("WEB_APP_URL is not configured");

    const rawToken = randomBytes(32).toString("hex");
    tokenHash = digestToken(rawToken);
    const now = new Date();
    await PasswordResetTokenModel.findOneAndUpdate(
      { userId: user._id } as never,
      { $set: { tokenHash, expiresAt: new Date(now.getTime() + RESET_TOKEN_TTL_MS), createdAt: now } },
      { upsert: true, returnDocument: "after", includeResultMetadata: false }
    );

    const resetUrl = new URL("/reset-password", `${webAppUrl}/`);
    resetUrl.searchParams.set("token", rawToken);
    await sendPasswordResetEmail(normalizedEmail, resetUrl.toString());
  } catch {
    // Keep the public response identical during provider/configuration failures.
    console.error("PASSWORD_RESET_REQUEST_FAILED");
    if (tokenHash) {
      try {
        await PasswordResetTokenModel.deleteOne({ userId: user._id, tokenHash });
      } catch {
        console.error("PASSWORD_RESET_TOKEN_CLEANUP_FAILED");
      }
    }
  }
}

// Cập nhật mật khẩu và tiêu thụ token trong cùng transaction để token chỉ được dùng thành công một lần.
export async function resetPassword(token: string, password: string): Promise<void> {
  const tokenHash = digestToken(token);
  const passwordHash = await hashPassword(password);
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      const resetToken = await PasswordResetTokenModel.findOneAndDelete(
        { tokenHash, expiresAt: { $gt: new Date() } } as never,
        { session, includeResultMetadata: false }
      );
      if (!resetToken) {
        throw new AppError(400, "INVALID_RESET_TOKEN", "Reset link is invalid or expired");
      }

      const result = await UserModel.updateOne(
        { _id: resetToken.userId } as never,
        { $set: { passwordHash, refreshTokenHash: null } },
        { session }
      );
      if (result.matchedCount !== 1) {
        throw new AppError(400, "INVALID_RESET_TOKEN", "Reset link is invalid or expired");
      }
    });
  } finally {
    await session.endSession();
  }
}
