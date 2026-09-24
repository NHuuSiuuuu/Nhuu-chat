import { Router } from "express";

import { requireRole } from "../auth/auth.middleware.js";
import { resolveWorkspaceContext } from "../auth/workspace.middleware.js";
import { finishInstagramOAuth, listInstagramConnections, removeInstagramConnection, startInstagramOAuth } from "../controllers/instagram.controller.js";

export const instagramRouter = Router();

instagramRouter.use(requireRole("admin", "agent", "customer"), resolveWorkspaceContext);
instagramRouter.get("/oauth/start", startInstagramOAuth);
instagramRouter.get("/oauth/callback", finishInstagramOAuth);
instagramRouter.get("/connections", listInstagramConnections);
instagramRouter.delete("/connections/:connectionId", removeInstagramConnection);
