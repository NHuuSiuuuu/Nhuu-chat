import { Router } from "express";

import { requireRole } from "../../auth/auth.middleware.js";
import {
  getZaloPersonalQr,
  getZaloPersonalStatus,
  logoutZaloPersonalSession,
  startZaloPersonalQr
} from "../../controllers/zalo-personal.controller.js";

export const zaloPersonalRouter = Router();

zaloPersonalRouter.post("/qr", requireRole("admin"), startZaloPersonalQr);
zaloPersonalRouter.get("/qr/:id", requireRole("admin"), getZaloPersonalQr);
zaloPersonalRouter.get("/status", requireRole("admin"), getZaloPersonalStatus);
zaloPersonalRouter.post("/logout", requireRole("admin"), logoutZaloPersonalSession);
