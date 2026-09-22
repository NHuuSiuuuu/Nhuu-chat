import express, { type ErrorRequestHandler } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const serviceMocks = vi.hoisted(() => ({
  getGeneralSettings: vi.fn(),
  updateGeneralSettings: vi.fn()
}));
const authMocks = vi.hoisted(() => ({ verifyAccessToken: vi.fn() }));

vi.mock("../services/general-settings.service.js", () => serviceMocks);
vi.mock("../services/auth.service.js", () => authMocks);

import { errorHandler } from "../common/errors.js";
import { createApp } from "../app.js";
import { generalSettingsRouter } from "./general-settings.routes.js";

function createRouteApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/me/general-settings", generalSettingsRouter);
  const captureError: ErrorRequestHandler = (error, req, res, next) => {
    errorHandler(error, req, res, next);
  };
  app.use(captureError);
  return app;
}

describe("general settings routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    authMocks.verifyAccessToken.mockImplementation(async (token: string) => {
      if (token === "user-1-token") return { id: "user-1", email: "one@example.com", role: "agent" };
      if (token === "user-2-token") return { id: "user-2", email: "two@example.com", role: "customer" };
      throw new Error("invalid token");
    });
  });

  it("is mounted by the app and rejects requests without authentication", async () => {
    const response = await request(createApp()).get("/api/v1/me/general-settings");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTHENTICATION_REQUIRED");
    expect(serviceMocks.getGeneralSettings).not.toHaveBeenCalled();
  });

  it("isolates GET requests by the authenticated user", async () => {
    serviceMocks.getGeneralSettings.mockImplementation(async (userId: string) => ({
      browserNotificationsEnabled: true,
      notificationSound: userId === "user-1" ? "tri-tone" : "off",
      moveUnreadConversationsToTop: true,
      openNextUnreadConversation: false
    }));

    const first = await request(createRouteApp())
      .get("/api/v1/me/general-settings")
      .set("Authorization", "Bearer user-1-token");
    const second = await request(createRouteApp())
      .get("/api/v1/me/general-settings")
      .set("Authorization", "Bearer user-2-token");

    expect(first.body.notificationSound).toBe("tri-tone");
    expect(second.body.notificationSound).toBe("off");
    expect(serviceMocks.getGeneralSettings).toHaveBeenNthCalledWith(1, "user-1");
    expect(serviceMocks.getGeneralSettings).toHaveBeenNthCalledWith(2, "user-2");
  });

  it("validates PATCH requests before updating the authenticated user", async () => {
    serviceMocks.updateGeneralSettings.mockResolvedValue({
      browserNotificationsEnabled: false,
      notificationSound: "default",
      moveUnreadConversationsToTop: true,
      openNextUnreadConversation: false
    });

    const invalid = await request(createRouteApp())
      .patch("/api/v1/me/general-settings")
      .set("Authorization", "Bearer user-1-token")
      .send({ notificationSound: "premium" });
    const valid = await request(createRouteApp())
      .patch("/api/v1/me/general-settings")
      .set("Authorization", "Bearer user-1-token")
      .send({ browserNotificationsEnabled: false });

    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe("INVALID_REQUEST");
    expect(valid.status).toBe(200);
    expect(serviceMocks.updateGeneralSettings).toHaveBeenCalledOnce();
    expect(serviceMocks.updateGeneralSettings).toHaveBeenCalledWith("user-1", {
      browserNotificationsEnabled: false
    });
  });
});
