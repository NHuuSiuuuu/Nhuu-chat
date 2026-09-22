import { AppError } from "../common/errors.js";
import {
  normalizeGeneralSettings,
  type GeneralSettings,
  type GeneralSettingsPatch
} from "../general-settings/general-settings.js";
import { UserModel } from "../models/user.model.js";

export async function getGeneralSettings(userId: string): Promise<GeneralSettings> {
  const user = await UserModel.findById(userId).lean();
  if (!user) throw new AppError(404, "USER_NOT_FOUND", "User was not found");

  return normalizeGeneralSettings(user.generalSettings);
}

export async function updateGeneralSettings(
  userId: string,
  patch: GeneralSettingsPatch
): Promise<GeneralSettings> {
  const set = Object.fromEntries(
    Object.entries(patch).map(([key, value]) => [`generalSettings.${key}`, value])
  );
  const user = await UserModel.findByIdAndUpdate(
    userId,
    { $set: set },
    { returnDocument: "before" }
  ).lean();
  if (!user) throw new AppError(404, "USER_NOT_FOUND", "User was not found");

  return normalizeGeneralSettings({
    ...normalizeGeneralSettings(user.generalSettings),
    ...patch
  });
}
