import { Router } from "express";

import { requireRole } from "../auth/auth.middleware.js";
import { changePassword, getCurrentUser, updateCurrentUser } from "../controllers/profile.controller.js";

export const profileRouter = Router();

profileRouter.get("/", requireRole("admin", "agent", "customer"), getCurrentUser);
profileRouter.patch("/", requireRole("admin", "agent", "customer"), updateCurrentUser);
profileRouter.post("/password", requireRole("admin", "agent", "customer"), changePassword);
