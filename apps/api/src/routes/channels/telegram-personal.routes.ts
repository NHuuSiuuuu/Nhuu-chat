import { Router } from "express";

import { requireRole } from "../../auth/auth.middleware.js";
import {
  getQrLoginStatus,
  getSessionStatus,
  startQrLogin,
  submitQrPassword
} from "../../controllers/telegram-personal.controller.js";

export const telegramPersonalRouter = Router();

telegramPersonalRouter.get("/status", requireRole("admin", "agent", "customer"), getSessionStatus);
telegramPersonalRouter.post("/qr", requireRole("admin", "agent", "customer"), startQrLogin);
telegramPersonalRouter.get("/qr/:id", requireRole("admin", "agent", "customer"), getQrLoginStatus);
telegramPersonalRouter.post("/qr/:id/password", requireRole("admin", "agent", "customer"), submitQrPassword);
