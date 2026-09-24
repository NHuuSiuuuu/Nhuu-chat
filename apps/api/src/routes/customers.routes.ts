import { Router } from "express";

import { requireRole } from "../auth/auth.middleware.js";
import { resolveWorkspaceContext } from "../auth/workspace.middleware.js";
import { inboxAccessRoles } from "../auth/inbox-access.js";
import { updateCustomerTags } from "../controllers/customers.controller.js";

export const customerRouter = Router();

customerRouter.patch("/:id/tags", requireRole(...inboxAccessRoles), resolveWorkspaceContext, updateCustomerTags);
