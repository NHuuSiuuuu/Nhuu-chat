import express, { type ErrorRequestHandler } from "express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const serviceMocks = vi.hoisted(() => ({
  listSettingHistories: vi.fn(),
  recordSettingHistorySafely: vi.fn()
}));
const authMocks = vi.hoisted(() => ({
  verifyAccessToken: vi.fn()
}));

vi.mock("../services/setting-history.service.js", () => serviceMocks);
vi.mock("../services/auth.service.js", () => authMocks);

import { errorHandler } from "../common/errors.js";
import { settingHistoryRouter } from "./setting-history.routes.js";

let createApp: typeof import("../app.js").createApp;

function createRouteApp() {
  const app = express();
  app.use("/api/v1/setting-histories", settingHistoryRouter);
  const captureError: ErrorRequestHandler = (error, req, res, next) => {
    errorHandler(error, req, res, next);
  };
  app.use(captureError);
  return app;
}

describe("setting history routes", () => {
  beforeAll(async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("MONGODB_URI", "mongodb://localhost:27017/nhuu-chat");
    vi.stubEnv("REDIS_URL", "redis://localhost:6379");
    vi.stubEnv("JWT_SECRET", "a-jwt-secret-that-is-at-least-32-characters");
    vi.stubEnv("ENCRYPTION_KEY", "an-encryption-key-that-is-32-characters");
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "123456789:test-token");
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "a-telegram-webhook-secret");
    ({ createApp } = await import("../app.js"));
  });

  afterAll(() => vi.unstubAllEnvs());

  beforeEach(() => {
    vi.resetAllMocks();
    authMocks.verifyAccessToken.mockResolvedValue({
      id: "user-1",
      email: "agent@example.com",
      role: "agent"
    });
    serviceMocks.listSettingHistories.mockResolvedValue({
      items: [],
      pagination: {
        page: 1,
        pageSize: 20,
        total: 0,
        totalPages: 0,
        hasNextPage: false
      }
    });
  });

  it("uses the existing authentication behavior", async () => {
    const response = await request(createRouteApp())
      .get("/api/v1/setting-histories");

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: {
        code: "AUTHENTICATION_REQUIRED",
        message: "A Bearer token is required"
      }
    });
    expect(serviceMocks.listSettingHistories).not.toHaveBeenCalled();
  });

  it("rejects unsupported filters through the HTTP error contract", async () => {
    const response = await request(createRouteApp())
      .get("/api/v1/setting-histories?actionType=DELETE_COMMENT")
      .set("Authorization", "Bearer agent-token");

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_REQUEST");
    expect(serviceMocks.listSettingHistories).not.toHaveBeenCalled();
  });

  it("is mounted by the app and returns the paginated response shape", async () => {
    const expected = {
      items: [{
        id: "history-1",
        actionType: "UPDATE_AI_SETTINGS",
        actionTitle: "Cập nhật cài đặt AI",
        changes: [{ fieldName: "enabled", oldValue: true, newValue: false }],
        versionHash: "a1b2c3d4",
        createdAt: "2026-09-22T08:30:00.000Z"
      }],
      pagination: {
        page: 1,
        pageSize: 20,
        total: 1,
        totalPages: 1,
        hasNextPage: false
      }
    };
    serviceMocks.listSettingHistories.mockResolvedValue(expected);

    const response = await request(createApp())
      .get("/api/v1/setting-histories?actionType=UPDATE_AI_SETTINGS")
      .set("Authorization", "Bearer agent-token");

    expect(response.status).toBe(200);
    expect(response.body).toEqual(expected);
    expect(serviceMocks.listSettingHistories).toHaveBeenCalledWith({
      userId: "user-1",
      page: 1,
      pageSize: 20,
      actionType: "UPDATE_AI_SETTINGS"
    });
  });
});
