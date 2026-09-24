import { Router } from "express";

import { authenticate } from "../auth/auth.middleware.js";
import {
  addWorkspaceMember,
  listWorkspaceMembers,
  listWorkspaceChannels,
  listWorkspaces,
  removeWorkspaceMember,
  updateWorkspaceMember
} from "../controllers/workspaces.controller.js";

export const workspacesRouter = Router();

workspacesRouter.use(authenticate);
workspacesRouter.get("/", listWorkspaces);
workspacesRouter.get("/:workspaceId/members", listWorkspaceMembers);
workspacesRouter.get("/:workspaceId/channels", listWorkspaceChannels);
workspacesRouter.post("/:workspaceId/members", addWorkspaceMember);
workspacesRouter.patch("/:workspaceId/members/:userId", updateWorkspaceMember);
workspacesRouter.delete("/:workspaceId/members/:userId", removeWorkspaceMember);
