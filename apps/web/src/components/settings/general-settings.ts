import type { GeneralSettingsContract } from "@nhuu-chat/contracts";

import { apiRequest } from "../../lib/api.js";

export const GENERAL_SETTINGS_API_PATH = "/api/v1/me/general-settings";

export type GeneralSettingsPatch = Partial<GeneralSettingsContract>;

type GeneralSettingsRequestOptions = {
  apiUrl: string;
  refresh?: () => Promise<string | null>;
  token: string;
};

export function loadGeneralSettings(options: GeneralSettingsRequestOptions): Promise<GeneralSettingsContract> {
  return apiRequest<GeneralSettingsContract>(options.apiUrl, GENERAL_SETTINGS_API_PATH, options.token, {}, options.refresh);
}

export function patchGeneralSettings(
  options: GeneralSettingsRequestOptions,
  patch: GeneralSettingsPatch
): Promise<GeneralSettingsContract> {
  return apiRequest<GeneralSettingsContract>(options.apiUrl, GENERAL_SETTINGS_API_PATH, options.token, {
    body: JSON.stringify(patch),
    method: "PATCH"
  }, options.refresh);
}
