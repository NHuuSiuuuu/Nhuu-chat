import { Router } from "express";

import { requireRole } from "../auth/auth.middleware.js";
import { inboxAccessRoles } from "../auth/inbox-access.js";
import { sendMessage } from "../controllers/messages.controller.js";

export const messageRouter = Router();

messageRouter.post("/send", requireRole(...inboxAccessRoles), sendMessage);
