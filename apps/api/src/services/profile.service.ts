import { AppError } from "../common/errors.js";
import { UserModel } from "../models/user.model.js";
import { hashPassword, verifyPassword } from "./auth.service.js";

export interface ProfileResponse {
  id: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
}

function toProfile(user: { _id?: unknown; id?: string; name: string; email: string }): ProfileResponse {
  return { id: user.id ?? String(user._id), displayName: user.name, email: user.email, avatarUrl: null };
}

export async function getCurrentUser(userId: string): Promise<ProfileResponse> {
  const user = await UserModel.findById(userId).lean();
  if (!user) throw new AppError(404, "USER_NOT_FOUND", "User was not found");
  return toProfile(user);
}

export async function updateCurrentUser(userId: string, displayName: string): Promise<ProfileResponse> {
  const user = await UserModel.findByIdAndUpdate(userId, { $set: { name: displayName } }, { new: true }).lean();
  if (!user) throw new AppError(404, "USER_NOT_FOUND", "User was not found");
  return toProfile(user);
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
  const user = await UserModel.findById(userId).select("+passwordHash");
  if (!user || !(await verifyPassword(user.passwordHash, currentPassword))) {
    throw new AppError(400, "INVALID_PASSWORD", "Current password is incorrect");
  }
  user.passwordHash = await hashPassword(newPassword);
  await user.save();
}
