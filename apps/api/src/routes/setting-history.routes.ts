import { Router } from "express";

import { requireRole } from "../auth/auth.middleware.js";
import { getSettingHistories } from "../controllers/setting-history.controller.js";

export const settingHistoryRouter = Router();

settingHistoryRouter.get("/", requireRole("admin", "agent"), getSettingHistories);
