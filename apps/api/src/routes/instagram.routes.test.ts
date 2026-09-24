import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

const oauth = vi.hoisted(() => ({ start: vi.fn(async () => ({ authorizationUrl: "https://www.instagram.com/oauth/authorize" })), finish: vi.fn(), cancel: vi.fn() }));
const accounts = vi.hoisted(() => ({ list: vi.fn(async () => []), disconnect: vi.fn(async () => ({ disconnected: false })) }));
vi.mock("../services/instagram-oauth.service.js", () => ({ instagramOAuthService: oauth }));
vi.mock("../services/instagram-account.service.js", () => ({ instagramAccountService: accounts }));
vi.mock("../services/auth.service.js", () => ({ verifyAccessToken: async () => ({ id: "owner", role: "agent" }) }));
vi.mock("../models/workspace-member.model.js", () => ({ WorkspaceMemberModel: {
  findOne: () => ({ sort: () => ({ lean: async () => ({ workspaceId: "507f1f77bcf86cd799439022", userId: "owner", role: "owner" }) }) }),
  find: () => ({ limit: () => ({ lean: async () => [] }) })
} }));
vi.mock("../models/workspace.model.js", () => ({ WorkspaceModel: { findById: () => ({ select: () => ({ lean: async () => ({ ownerUserId: "owner" }) }) }) } }));

import { errorHandler } from "../common/errors.js";
import { instagramRouter } from "./instagram.routes.js";

function app() { const instance = express(); instance.use("/api/v1/instagram", instagramRouter); instance.use(errorHandler); return instance; }

describe("Instagram routes", () => {
  it("requires authentication to start OAuth", async () => {
    const result = await request(app()).get("/api/v1/instagram/oauth/start");
    expect(result.status).toBe(401);
    expect(oauth.start).not.toHaveBeenCalled();
  });

  it("routes owner start, list and idempotent disconnect", async () => {
    const start = await request(app()).get("/api/v1/instagram/oauth/start").set("Authorization", "Bearer valid");
    expect(start.status).toBe(200);
    expect(start.body.authorizationUrl).toContain("instagram.com");
    const list = await request(app()).get("/api/v1/instagram/connections").set("Authorization", "Bearer valid");
    expect(list.body).toEqual({ connections: [] });
    const remove = await request(app()).delete("/api/v1/instagram/connections/507f1f77bcf86cd799439011").set("Authorization", "Bearer valid");
    expect(remove.status).toBe(200);
    expect(remove.body).toEqual({ disconnected: false });
  });
});
