import { Router } from "express";

import { requireRole } from "../auth/auth.middleware.js";
import { updateCustomerTags } from "../controllers/customers.controller.js";

export const customerRouter = Router();

customerRouter.patch("/:id/tags", requireRole("admin", "agent"), updateCustomerTags);
