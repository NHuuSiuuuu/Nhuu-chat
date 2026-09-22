import { Router } from "express";

import { requireRole } from "../auth/auth.middleware.js";
import {
  getGeneralSettings,
  updateGeneralSettings
} from "../controllers/general-settings.controller.js";

export const generalSettingsRouter = Router();

generalSettingsRouter.get("/", requireRole("admin", "agent", "customer"), getGeneralSettings);
generalSettingsRouter.patch("/", requireRole("admin", "agent", "customer"), updateGeneralSettings);
