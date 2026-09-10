import { beforeEach, describe, expect, it, vi } from "vitest";

const serviceMocks = vi.hoisted(() => ({
  getPersonalQrLoginStatus: vi.fn(),
  getPersonalSessionStatus: vi.fn(),
  startPersonalQrLogin: vi.fn(),
  submitPersonalQrPassword: vi.fn()
}));

vi.mock("../services/telegram-personal.service.js", () => serviceMocks);

import {
  getQrLoginStatus,
  getSessionStatus,
  startQrLogin,
  submitQrPassword
} from "./telegram-personal.controller.js";

function responseRecorder() {
  const state: { body?: unknown; statusCode: number } = { statusCode: 200 };
  const response = {
    json(body: unknown) {
      state.body = body;
      return response;
    },
    status(statusCode: number) {
      state.statusCode = statusCode;
      return response;
    }
  };
  return { response, state };
}

const auth = { id: "user-1", email: "user@example.com", role: "customer" } as const;

describe("Telegram personal controller", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns the authenticated user's personal session status", async () => {
    const status = { connected: true, displayName: "Nhuu", username: "nhuu" };
    serviceMocks.getPersonalSessionStatus.mockResolvedValue(status);
    const { response, state } = responseRecorder();
    const next = vi.fn();

    await getSessionStatus({ auth } as never, response as never, next);

    expect(serviceMocks.getPersonalSessionStatus).toHaveBeenCalledWith("user-1");
    expect(state.body).toEqual(status);
    expect(next).not.toHaveBeenCalled();
  });

  it("starts a QR login for the authenticated user", async () => {
    const status = { id: "qr-1", status: "waiting" };
    serviceMocks.startPersonalQrLogin.mockResolvedValue(status);
    const { response, state } = responseRecorder();
    const next = vi.fn();

    await startQrLogin({ auth } as never, response as never, next);

    expect(serviceMocks.startPersonalQrLogin).toHaveBeenCalledWith("user-1");
    expect(state.statusCode).toBe(201);
    expect(state.body).toEqual(status);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns an owned QR login status", async () => {
    const status = { id: "qr-1", status: "password_required" };
    serviceMocks.getPersonalQrLoginStatus.mockReturnValue(status);
    const { response, state } = responseRecorder();
    const next = vi.fn();

    await getQrLoginStatus({ auth, params: { id: "qr-1" } } as never, response as never, next);

    expect(serviceMocks.getPersonalQrLoginStatus).toHaveBeenCalledWith("qr-1", "user-1");
    expect(state.body).toEqual(status);
    expect(next).not.toHaveBeenCalled();
  });

  it("passes the original 2FA password only to the owned QR login", async () => {
    const status = { id: "qr-1", status: "waiting" };
    serviceMocks.submitPersonalQrPassword.mockReturnValue(status);
    const { response, state } = responseRecorder();
    const next = vi.fn();

    await submitQrPassword({
      auth,
      params: { id: "qr-1" },
      body: { password: "  secret phrase  " }
    } as never, response as never, next);

    expect(serviceMocks.submitPersonalQrPassword).toHaveBeenCalledWith(
      "qr-1",
      "user-1",
      "  secret phrase  "
    );
    expect(state.body).toEqual(status);
    expect(next).not.toHaveBeenCalled();
  });

  it("preserves the invalid-request error for a blank 2FA password", async () => {
    const { response } = responseRecorder();
    const next = vi.fn();

    await submitQrPassword({
      auth,
      params: { id: "qr-1" },
      body: { password: "   " }
    } as never, response as never, next);

    expect(next.mock.calls[0]?.[0]).toMatchObject({
      statusCode: 400,
      code: "INVALID_REQUEST",
      message: "Telegram 2FA password is required"
    });
    expect(serviceMocks.submitPersonalQrPassword).not.toHaveBeenCalled();
  });

  it("converts an invalid QR login id to an invalid-request error", async () => {
    const { response } = responseRecorder();
    const next = vi.fn();

    await getQrLoginStatus({ auth, params: { id: 123 } } as never, response as never, next);

    expect(next.mock.calls[0]?.[0]).toMatchObject({
      statusCode: 400,
      code: "INVALID_REQUEST",
      message: "QR login id is missing"
    });
    expect(serviceMocks.getPersonalQrLoginStatus).not.toHaveBeenCalled();
  });

  it("preserves the missing-authentication failure without calling a service", async () => {
    const { response } = responseRecorder();
    const next = vi.fn();

    await getSessionStatus({} as never, response as never, next);

    expect(next.mock.calls[0]?.[0]).toMatchObject({ message: "Authenticated user is missing" });
    expect(serviceMocks.getPersonalSessionStatus).not.toHaveBeenCalled();
  });
});
