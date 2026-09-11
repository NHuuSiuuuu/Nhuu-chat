import { Router } from "express";

import { requireRole } from "../auth/auth.middleware.js";
import { getAiSettings, updateAiSettings } from "../controllers/ai-settings.controller.js";

export const aiSettingsRouter = Router();

aiSettingsRouter.get("/", requireRole("admin", "agent"), getAiSettings);
aiSettingsRouter.patch("/", requireRole("admin", "agent"), updateAiSettings);
