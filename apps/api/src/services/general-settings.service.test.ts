import { beforeEach, describe, expect, it, vi } from "vitest";

const userModelMocks = vi.hoisted(() => ({
  findById: vi.fn(),
  findByIdAndUpdate: vi.fn()
}));

vi.mock("../models/user.model.js", () => ({ UserModel: userModelMocks }));

import { getGeneralSettings, updateGeneralSettings } from "./general-settings.service.js";

function query<T>(value: T) {
  return { lean: vi.fn().mockResolvedValue(value) };
}

describe("general settings service", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns complete defaults when an existing user has no saved settings", async () => {
    userModelMocks.findById.mockReturnValue(query({ _id: "user-1" }));

    await expect(getGeneralSettings("user-1")).resolves.toEqual({
      browserNotificationsEnabled: true,
      notificationSound: "default",
      moveUnreadConversationsToTop: true,
      openNextUnreadConversation: false,
      themeMode: "light", accentColor: "blue", interfaceDensity: "comfortable", messageFontSize: "medium"
    });
    expect(userModelMocks.findById).toHaveBeenCalledWith("user-1");
  });

  it("persists only patched fields and returns the merged settings", async () => {
    userModelMocks.findByIdAndUpdate.mockReturnValue(query({
      _id: "user-1",
      generalSettings: {
        browserNotificationsEnabled: true,
        notificationSound: "default",
        moveUnreadConversationsToTop: true,
        openNextUnreadConversation: false,
        themeMode: "light", accentColor: "blue", interfaceDensity: "comfortable", messageFontSize: "medium"
      }
    }));

    await expect(updateGeneralSettings("user-1", {
      notificationSound: "clubhouse",
      openNextUnreadConversation: true,
      themeMode: "dark",
      accentColor: "cyan"
    })).resolves.toEqual({
      browserNotificationsEnabled: true,
      notificationSound: "clubhouse",
      moveUnreadConversationsToTop: true,
      openNextUnreadConversation: true,
      themeMode: "dark", accentColor: "cyan", interfaceDensity: "comfortable", messageFontSize: "medium"
    });
    expect(userModelMocks.findByIdAndUpdate).toHaveBeenCalledWith(
      "user-1",
      { $set: {
        "generalSettings.notificationSound": "clubhouse",
        "generalSettings.openNextUnreadConversation": true,
        "generalSettings.themeMode": "dark",
        "generalSettings.accentColor": "cyan"
      } },
      { returnDocument: "before" }
    );
  });

  it("keeps reads isolated to each authenticated user id", async () => {
    userModelMocks.findById
      .mockReturnValueOnce(query({ _id: "user-1", generalSettings: { notificationSound: "tri-tone" } }))
      .mockReturnValueOnce(query({ _id: "user-2", generalSettings: { notificationSound: "off" } }));

    await expect(getGeneralSettings("user-1")).resolves.toMatchObject({ notificationSound: "tri-tone" });
    await expect(getGeneralSettings("user-2")).resolves.toMatchObject({ notificationSound: "off" });
    expect(userModelMocks.findById).toHaveBeenNthCalledWith(1, "user-1");
    expect(userModelMocks.findById).toHaveBeenNthCalledWith(2, "user-2");
  });
});
