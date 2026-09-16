import { Router } from "express";

import { requireRole } from "../../auth/auth.middleware.js";
import {
  getQrLoginStatus,
  getSessionStatus,
  logoutPersonalSession,
  startQrLogin,
  submitQrPassword
} from "../../controllers/telegram-personal.controller.js";

export const telegramPersonalRouter = Router();

telegramPersonalRouter.get("/status", requireRole("admin", "agent", "customer"), getSessionStatus);
telegramPersonalRouter.post("/logout", requireRole("admin", "agent", "customer"), logoutPersonalSession);
telegramPersonalRouter.post("/qr", requireRole("admin", "agent", "customer"), startQrLogin);
telegramPersonalRouter.get("/qr/:id", requireRole("admin", "agent", "customer"), getQrLoginStatus);
telegramPersonalRouter.post("/qr/:id/password", requireRole("admin", "agent", "customer"), submitQrPassword);
