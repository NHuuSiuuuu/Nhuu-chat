import { beforeEach, describe, expect, it, vi } from "vitest";

const serviceMocks = vi.hoisted(() => ({
  getGeneralSettings: vi.fn(),
  updateGeneralSettings: vi.fn()
}));

vi.mock("../services/general-settings.service.js", () => serviceMocks);

import { getGeneralSettings, updateGeneralSettings } from "./general-settings.controller.js";

function responseRecorder() {
  const state: { body?: unknown } = {};
  const response = {
    json(body: unknown) {
      state.body = body;
      return response;
    }
  };
  return { response, state };
}

describe("general settings controller", () => {
  beforeEach(() => vi.resetAllMocks());

  it("reads settings for only the authenticated user", async () => {
    const expected = {
      browserNotificationsEnabled: true,
      notificationSound: "default",
      moveUnreadConversationsToTop: true,
      openNextUnreadConversation: false
    };
    serviceMocks.getGeneralSettings.mockResolvedValue(expected);
    const { response, state } = responseRecorder();
    const next = vi.fn();

    await getGeneralSettings({ auth: { id: "user-1" } } as never, response as never, next);

    expect(serviceMocks.getGeneralSettings).toHaveBeenCalledWith("user-1");
    expect(state.body).toEqual(expected);
    expect(next).not.toHaveBeenCalled();
  });

  it("passes a valid partial patch with the authenticated user id", async () => {
    const expected = {
      browserNotificationsEnabled: true,
      notificationSound: "off",
      moveUnreadConversationsToTop: true,
      openNextUnreadConversation: false
    };
    serviceMocks.updateGeneralSettings.mockResolvedValue(expected);
    const { response, state } = responseRecorder();
    const next = vi.fn();

    await updateGeneralSettings({
      auth: { id: "user-1" },
      body: { notificationSound: "off" }
    } as never, response as never, next);

    expect(serviceMocks.updateGeneralSettings).toHaveBeenCalledWith("user-1", {
      notificationSound: "off"
    });
    expect(state.body).toEqual(expected);
    expect(next).not.toHaveBeenCalled();
  });

  it.each([
    { notificationSound: "premium" },
    { browserNotificationsEnabled: "true" }
  ])("maps invalid settings to the HTTP validation error: %j", async (body) => {
    const { response, state } = responseRecorder();
    const next = vi.fn();

    await updateGeneralSettings({ auth: { id: "user-1" }, body } as never, response as never, next);

    expect(next.mock.calls[0]?.[0]).toMatchObject({ statusCode: 400, code: "INVALID_REQUEST" });
    expect(state.body).toBeUndefined();
    expect(serviceMocks.updateGeneralSettings).not.toHaveBeenCalled();
  });
});
