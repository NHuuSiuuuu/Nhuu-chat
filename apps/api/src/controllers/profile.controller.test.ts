import { beforeEach, describe, expect, it, vi } from "vitest";

const serviceMocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  updateCurrentUser: vi.fn(),
  changePassword: vi.fn()
}));

vi.mock("../services/profile.service.js", () => serviceMocks);

import { changePassword, getCurrentUser, updateCurrentUser } from "./profile.controller.js";

function responseRecorder() {
  const state: { body?: unknown; statusCode: number } = { statusCode: 200 };
  const response = {
    status(code: number) { state.statusCode = code; return response; },
    json(body: unknown) { state.body = body; return response; },
    send() { return response; }
  };
  return { response, state };
}

describe("profile controller", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns the authenticated user's profile", async () => {
    const profile = { id: "user-1", displayName: "Hữu", email: "huu@example.com", avatarUrl: null };
    serviceMocks.getCurrentUser.mockResolvedValue(profile);
    const { response, state } = responseRecorder();
    const next = vi.fn();

    await getCurrentUser({ auth: { id: "user-1" } } as never, response as never, next);

    expect(serviceMocks.getCurrentUser).toHaveBeenCalledWith("user-1");
    expect(state.body).toEqual(profile);
    expect(next).not.toHaveBeenCalled();
  });

  it("updates only the display name", async () => {
    const profile = { id: "user-1", displayName: "Tên mới", email: "huu@example.com", avatarUrl: null };
    serviceMocks.updateCurrentUser.mockResolvedValue(profile);
    const { response, state } = responseRecorder();
    const next = vi.fn();

    await updateCurrentUser({ auth: { id: "user-1" }, body: { displayName: "  Tên mới  " } } as never, response as never, next);

    expect(serviceMocks.updateCurrentUser).toHaveBeenCalledWith("user-1", "Tên mới");
    expect(state.body).toEqual(profile);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects a blank display name", async () => {
    const { response, state } = responseRecorder();
    const next = vi.fn();

    await updateCurrentUser({ auth: { id: "user-1" }, body: { displayName: "   " } } as never, response as never, next);

    expect(next.mock.calls[0]?.[0]).toMatchObject({ statusCode: 400, code: "INVALID_REQUEST" });
    expect(state.body).toBeUndefined();
    expect(serviceMocks.updateCurrentUser).not.toHaveBeenCalled();
  });

  it("passes password changes to the service", async () => {
    serviceMocks.changePassword.mockResolvedValue(undefined);
    const { response, state } = responseRecorder();
    const next = vi.fn();

    await changePassword({ auth: { id: "user-1" }, body: { currentPassword: "old-password", newPassword: "new-password" } } as never, response as never, next);

    expect(serviceMocks.changePassword).toHaveBeenCalledWith("user-1", "old-password", "new-password");
    expect(state.statusCode).toBe(204);
    expect(next).not.toHaveBeenCalled();
  });
});
