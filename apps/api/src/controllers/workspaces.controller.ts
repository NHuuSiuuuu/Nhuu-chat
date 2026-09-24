import type { RequestHandler } from "express";

import type { AuthenticatedRequest } from "../auth/auth.middleware.js";
import { AppError } from "../common/errors.js";
import { isMongoId, workspaceMemberPatchSchema, workspaceMemberSchema } from "../schemas/workspace.schemas.js";
import { workspaceMemberService } from "../services/workspace-member.service.js";

function authenticatedUserId(request: AuthenticatedRequest): string {
  const userId = request.auth?.id;
  if (!userId) throw new AppError(401, "AUTHENTICATION_REQUIRED", "Authentication is required");
  return userId;
}

function workspaceId(request: Parameters<RequestHandler>[0]): string {
  const value = request.params.workspaceId;
  if (typeof value !== "string" || !isMongoId(value)) throw new AppError(400, "INVALID_REQUEST", "Workspace id is invalid");
  return value;
}

function memberId(request: Parameters<RequestHandler>[0]): string {
  const value = request.params.userId;
  if (typeof value !== "string" || !isMongoId(value)) throw new AppError(400, "INVALID_REQUEST", "User id is invalid");
  return value;
}

export const listWorkspaces: RequestHandler = async (request, response, next) => {
  try {
    response.json(await workspaceMemberService.listWorkspaces(authenticatedUserId(request as AuthenticatedRequest)));
  } catch (error) { next(error); }
};

export const listWorkspaceMembers: RequestHandler = async (request, response, next) => {
  try {
    response.json(await workspaceMemberService.listMembers(
      workspaceId(request), authenticatedUserId(request as AuthenticatedRequest)
    ));
  } catch (error) { next(error); }
};

export const listWorkspaceChannels: RequestHandler = async (request, response, next) => {
  try {
    response.json(await workspaceMemberService.listChannels(
      workspaceId(request), authenticatedUserId(request as AuthenticatedRequest)
    ));
  } catch (error) { next(error); }
};

export const addWorkspaceMember: RequestHandler = async (request, response, next) => {
  try {
    const input = workspaceMemberSchema.safeParse(request.body);
    if (!input.success) throw new AppError(400, "INVALID_REQUEST", "Workspace member data is invalid");
    response.status(201).json(await workspaceMemberService.addMember(
      workspaceId(request), authenticatedUserId(request as AuthenticatedRequest), input.data
    ));
  } catch (error) { next(error); }
};

export const updateWorkspaceMember: RequestHandler = async (request, response, next) => {
  try {
    const input = workspaceMemberPatchSchema.safeParse(request.body);
    if (!input.success) throw new AppError(400, "INVALID_REQUEST", "Workspace member patch is invalid");
    response.json(await workspaceMemberService.updateMember(
      workspaceId(request), authenticatedUserId(request as AuthenticatedRequest), memberId(request), input.data
    ));
  } catch (error) { next(error); }
};

export const removeWorkspaceMember: RequestHandler = async (request, response, next) => {
  try {
    await workspaceMemberService.removeMember(
      workspaceId(request), authenticatedUserId(request as AuthenticatedRequest), memberId(request)
    );
    response.status(204).send();
  } catch (error) { next(error); }
};
