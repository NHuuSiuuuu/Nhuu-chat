import { Router } from "express";

import { requireRole } from "../auth/auth.middleware.js";
import { connectFacebookPage, getFacebookPage, removeFacebookPage } from "../controllers/facebook-page.controller.js";

export const facebookPageRouter = Router();

facebookPageRouter.use(requireRole("admin", "agent"));
facebookPageRouter.get("/connection", getFacebookPage);
facebookPageRouter.post("/connection", connectFacebookPage);
facebookPageRouter.delete("/connection", removeFacebookPage);
