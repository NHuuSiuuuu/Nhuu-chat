import { Router } from "express";

import { requireRole } from "../auth/auth.middleware.js";
import { connectFacebookPage, finishFacebookOAuth, getFacebookPage, listFacebookOAuthPages, removeFacebookPage, selectFacebookOAuthPage, startFacebookOAuth } from "../controllers/facebook-page.controller.js";

export const facebookPageRouter = Router();

facebookPageRouter.get("/oauth/callback", finishFacebookOAuth);
facebookPageRouter.use(requireRole("admin", "agent"));
facebookPageRouter.get("/oauth/start", startFacebookOAuth);
facebookPageRouter.get("/oauth/pages", listFacebookOAuthPages);
facebookPageRouter.post("/oauth/select", selectFacebookOAuthPage);
facebookPageRouter.get("/connection", getFacebookPage);
facebookPageRouter.post("/connection", connectFacebookPage);
facebookPageRouter.delete("/connection", removeFacebookPage);
