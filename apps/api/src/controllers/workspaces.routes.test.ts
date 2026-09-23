import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { errorHandler } from "../common/errors.js";
import { issueTokens } from "../services/auth.service.js";

const serviceMocks = vi.hoisted(() => ({
  listWorkspaces: vi.fn(), listMembers: vi.fn(), addMember: vi.fn(), updateMember: vi.fn(), removeMember: vi.fn()
}));
vi.mock("../services/workspace-member.service.js", () => ({ workspaceMemberService: serviceMocks }));

import { workspacesRouter } from "../routes/workspaces.routes.js";

process.env.JWT_SECRET ??= "workspace-route-tests-secret-with-at-least-32-characters";

const app = express();
app.use(express.json());
app.use("/api/v1/workspaces", workspacesRouter);
app.use(errorHandler);

async function customerToken() {
  return (await issueTokens({ id: "507f1f77bcf86cd799439011", email: "owner@example.com", role: "customer" })).accessToken;
}

describe("Workspace routes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires authentication and lists the authenticated user's workspaces", async () => {
    serviceMocks.listWorkspaces.mockResolvedValue({ workspaces: [{ id: "workspace-1", role: "owner" }] });
    expect((await request(app).get("/api/v1/workspaces")).status).toBe(401);

    const token = await customerToken();
    await expect(request(app).get("/api/v1/workspaces").set("Authorization", `Bearer ${token}`))
      .resolves.toMatchObject({ status: 200, body: { workspaces: [{ role: "owner" }] } });
    expect(serviceMocks.listWorkspaces).toHaveBeenCalledWith("507f1f77bcf86cd799439011");
  });

  it("rejects owner assignment at the API boundary and creates a valid member", async () => {
    const token = await customerToken();
    const url = "/api/v1/workspaces/507f1f77bcf86cd799439012/members";
    await expect(request(app).post(url).set("Authorization", `Bearer ${token}`)
      .send({ email: "staff@example.com", role: "owner" }))
      .resolves.toMatchObject({ status: 400, body: { error: { code: "INVALID_REQUEST" } } });
    expect(serviceMocks.addMember).not.toHaveBeenCalled();

    serviceMocks.addMember.mockResolvedValue({ member: { email: "staff@example.com", role: "staff" } });
    await expect(request(app).post(url).set("Authorization", `Bearer ${token}`)
      .send({ email: "staff@example.com", role: "staff", allowedPages: [] }))
      .resolves.toMatchObject({ status: 201, body: { member: { role: "staff" } } });
    expect(serviceMocks.addMember).toHaveBeenCalledWith(
      "507f1f77bcf86cd799439012", "507f1f77bcf86cd799439011",
      { email: "staff@example.com", role: "staff", allowedPages: [] }
    );
  });
});
