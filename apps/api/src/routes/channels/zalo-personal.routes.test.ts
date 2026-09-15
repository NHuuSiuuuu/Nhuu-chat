import { describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const routeMocks = vi.hoisted(() => ({
  getZaloPersonalQr: vi.fn((_request: unknown, response: { sendStatus: (status: number) => unknown }) => response.sendStatus(204)),
  getZaloPersonalStatus: vi.fn((_request: unknown, response: { sendStatus: (status: number) => unknown }) => response.sendStatus(204)),
  logoutZaloPersonalSession: vi.fn((_request: unknown, response: { sendStatus: (status: number) => unknown }) => response.sendStatus(204)),
  requireRole: vi.fn((_role: string) => (_request: unknown, _response: unknown, next: () => void) => next()),
  startZaloPersonalQr: vi.fn((_request: unknown, response: { sendStatus: (status: number) => unknown }) => response.sendStatus(201))
}));

vi.mock("../../auth/auth.middleware.js", () => ({ requireRole: routeMocks.requireRole }));
vi.mock("../../controllers/zalo-personal.controller.js", () => ({
  getZaloPersonalQr: routeMocks.getZaloPersonalQr,
  getZaloPersonalStatus: routeMocks.getZaloPersonalStatus,
  logoutZaloPersonalSession: routeMocks.logoutZaloPersonalSession,
  startZaloPersonalQr: routeMocks.startZaloPersonalQr
}));

import { zaloPersonalRouter } from "./zalo-personal.routes.js";

describe("Zalo personal routes", () => {
  it("registers every connection route behind admin authorization", async () => {
    const routes = zaloPersonalRouter.stack
      .filter((layer) => layer.route)
      .map((layer) => ({
        path: layer.route?.path,
        methods: (layer.route as { methods?: unknown } | undefined)?.methods
      }));

    expect(routes).toEqual([
      { path: "/qr", methods: expect.objectContaining({ post: true }) },
      { path: "/qr/:id", methods: expect.objectContaining({ get: true }) },
      { path: "/status", methods: expect.objectContaining({ get: true }) },
      { path: "/logout", methods: expect.objectContaining({ post: true }) }
    ]);
    expect(routeMocks.requireRole).toHaveBeenCalledTimes(4);
    expect(routeMocks.requireRole).toHaveBeenNthCalledWith(1, "admin");
    expect(routeMocks.requireRole).toHaveBeenNthCalledWith(2, "admin");
    expect(routeMocks.requireRole).toHaveBeenNthCalledWith(3, "admin");
    expect(routeMocks.requireRole).toHaveBeenNthCalledWith(4, "admin");

    const app = express();
    app.use(zaloPersonalRouter);
    await expect(request(app).post("/qr")).resolves.toMatchObject({ status: 201 });
    await expect(request(app).get("/qr/qr-1")).resolves.toMatchObject({ status: 204 });
    await expect(request(app).get("/status")).resolves.toMatchObject({ status: 204 });
    await expect(request(app).post("/logout")).resolves.toMatchObject({ status: 204 });
  });
});
