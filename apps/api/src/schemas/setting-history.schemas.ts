import { z } from "zod";

import { SETTING_HISTORY_ACTION_TYPES } from "../models/setting-history.model.js";

export const settingHistoryListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive()
    .transform((value) => Math.min(value, 50))
    .default(20),
  actionType: z.enum(SETTING_HISTORY_ACTION_TYPES).optional()
});
