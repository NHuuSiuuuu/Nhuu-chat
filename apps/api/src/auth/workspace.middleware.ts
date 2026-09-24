import type { RequestHandler } from "express";
import { isValidObjectId } from "mongoose";

import { AppError } from "../common/errors.js";
import { WorkspaceMemberModel } from "../models/workspace-member.model.js";
import { WorkspaceModel } from "../models/workspace.model.js";
import { workspaceService } from "../services/workspace.service.js";
import { effectiveAllowedChannels } from "./workspace-channel-access.js";
import type { AuthenticatedRequest } from "./auth.middleware.js";

export interface WorkspaceContext {
  id: string;
  ownerUserId: string;
  role: "owner" | "admin" | "staff";
  allowedPages: string[] | null;
  allowedChannels: Array<{ platform: "facebook" | "instagram" | "zalo" | "telegram" | "zalo_personal" | "telegram_personal"; channelId: string }>;
}

export const resolveWorkspaceContext: RequestHandler = async (request, _response, next) => {
  try {
    const authRequest = request as AuthenticatedRequest & { workspace?: WorkspaceContext };
    const userId = authRequest.auth?.id;
    if (!userId) throw new AppError(401, "AUTHENTICATION_REQUIRED", "Authentication is required");
    const requestedId = request.header("x-workspace-id");
    if (requestedId && !isValidObjectId(requestedId)) throw new AppError(400, "INVALID_WORKSPACE_ID", "Workspace ID is invalid");
    let membership = requestedId
      ? await WorkspaceMemberModel.findOne({ workspaceId: requestedId, userId }).lean()
      : await WorkspaceMemberModel.findOne({ userId, role: "owner" }).sort({ createdAt: 1 }).lean();
    if (!membership && !requestedId) {
      const memberships = await WorkspaceMemberModel.find({ userId }).limit(2).lean();
      if (memberships.length > 1) throw new AppError(400, "WORKSPACE_SELECTION_REQUIRED", "Select a Workspace before continuing");
      membership = memberships[0] ?? null;
      if (!membership) {
        await workspaceService.ensurePersonalWorkspace(userId);
        membership = await WorkspaceMemberModel.findOne({ userId, role: "owner" }).sort({ createdAt: 1 }).lean();
      }
    }
    if (!membership) throw new AppError(requestedId ? 403 : 404, requestedId ? "WORKSPACE_MEMBERSHIP_REQUIRED" : "WORKSPACE_NOT_FOUND", "Workspace membership is required");
    const workspace = await WorkspaceModel.findById(membership.workspaceId).select("ownerUserId").lean();
    if (!workspace) throw new AppError(404, "WORKSPACE_NOT_FOUND", "Workspace was not found");
    const allowedChannels = membership.role === "staff" ? effectiveAllowedChannels(membership) : [];
    authRequest.workspace = {
      id: String(membership.workspaceId), ownerUserId: String(workspace.ownerUserId),
      role: membership.role, allowedChannels,
      allowedPages: membership.role !== "staff" || allowedChannels.length === 0
        ? null
        : allowedChannels.filter((channel) => channel.platform === "facebook").map((channel) => channel.channelId)
    };
    next();
  } catch (error) { next(error); }
};
