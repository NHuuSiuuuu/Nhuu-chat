import { beforeEach, describe, expect, it, vi } from "vitest";

const serviceMocks = vi.hoisted(() => ({
  getZaloPersonalQrStatus: vi.fn(),
  getZaloPersonalSessionStatus: vi.fn(),
  logoutZaloPersonal: vi.fn(),
  startZaloPersonalQr: vi.fn()
}));

vi.mock("../services/zalo-personal.service.js", () => serviceMocks);

import {
  getZaloPersonalQr,
  getZaloPersonalStatus,
  logoutZaloPersonalSession,
  startZaloPersonalQr
} from "./zalo-personal.controller.js";

function responseRecorder() {
  const state: { body?: unknown; statusCode: number } = { statusCode: 200 };
  const response = {
    json(body: unknown) {
      state.body = body;
      return response;
    },
    send() {
      return response;
    },
    status(statusCode: number) {
      state.statusCode = statusCode;
      return response;
    }
  };
  return { response, state };
}

const auth = { id: "owner-1", email: "owner@example.com", role: "admin" } as const;

describe("Zalo personal controller", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("starts a QR login only for the authenticated owner", async () => {
    const status = { id: "qr-1", status: "waiting_qr", qrData: "temporary-qr" };
    serviceMocks.startZaloPersonalQr.mockResolvedValue(status);
    const { response, state } = responseRecorder();
    const next = vi.fn();

    await startZaloPersonalQr({ auth, body: { ownerId: "other-owner" } } as never, response as never, next);

    expect(serviceMocks.startZaloPersonalQr).toHaveBeenCalledWith("owner-1");
    expect(state.statusCode).toBe(201);
    expect(state.body).toEqual(status);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns a QR status only for the authenticated owner", async () => {
    const status = { id: "qr-1", status: "connected", displayName: "Nhuu", zaloUserId: "zalo-1" };
    serviceMocks.getZaloPersonalQrStatus.mockReturnValue(status);
    const { response, state } = responseRecorder();
    const next = vi.fn();

    await getZaloPersonalQr({ auth, params: { id: "qr-1" } } as never, response as never, next);

    expect(serviceMocks.getZaloPersonalQrStatus).toHaveBeenCalledWith("qr-1", "owner-1");
    expect(state.body).toEqual(status);
    expect(next).not.toHaveBeenCalled();
  });

  it.each([undefined, "", []])("maps a missing QR id to QR_LOGIN_NOT_FOUND (%j)", async (id) => {
    const { response } = responseRecorder();
    const next = vi.fn();

    await getZaloPersonalQr({ auth, params: { id } } as never, response as never, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      statusCode: 404,
      code: "QR_LOGIN_NOT_FOUND"
    }));
    expect(serviceMocks.getZaloPersonalQrStatus).not.toHaveBeenCalled();
  });

  it("returns only the safe current-owner status payload", async () => {
    const status = { id: "owner-1", status: "error", errorCode: "ZALO_PERSONAL_LOGIN_FAILED" };
    serviceMocks.getZaloPersonalSessionStatus.mockResolvedValue(status);
    const { response, state } = responseRecorder();
    const next = vi.fn();

    await getZaloPersonalStatus({ auth, body: { ownerId: "other-owner" } } as never, response as never, next);

    expect(serviceMocks.getZaloPersonalSessionStatus).toHaveBeenCalledWith("owner-1");
    expect(state.body).toEqual(status);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects a status payload that contains connector credentials", async () => {
    serviceMocks.getZaloPersonalSessionStatus.mockResolvedValue({
      id: "owner-1",
      status: "connected",
      cookie: "secret"
    });
    const { response } = responseRecorder();
    const next = vi.fn();

    await getZaloPersonalStatus({ auth } as never, response as never, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      statusCode: 503,
      code: "ZALO_PERSONAL_UNAVAILABLE"
    }));
  });

  it("logs out only the authenticated owner", async () => {
    serviceMocks.logoutZaloPersonal.mockResolvedValue(undefined);
    const { response, state } = responseRecorder();
    const next = vi.fn();

    await logoutZaloPersonalSession({ auth, body: { ownerId: "other-owner" } } as never, response as never, next);

    expect(serviceMocks.logoutZaloPersonal).toHaveBeenCalledWith("owner-1");
    expect(state.statusCode).toBe(204);
    expect(next).not.toHaveBeenCalled();
  });

  it("maps an unexpected connector failure to a safe error", async () => {
    serviceMocks.startZaloPersonalQr.mockRejectedValue(new Error("cookie=secret"));
    const { response } = responseRecorder();
    const next = vi.fn();

    await startZaloPersonalQr({ auth } as never, response as never, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      statusCode: 503,
      code: "ZALO_PERSONAL_UNAVAILABLE",
      message: "Zalo personal service is temporarily unavailable"
    }));
  });
});
