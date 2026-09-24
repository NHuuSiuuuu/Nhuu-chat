import { describe, expect, expectTypeOf, it } from "vitest";
import type {
  GeneralSettingsContract,
  NotificationSound as ContractNotificationSound
} from "@nhuu-chat/contracts";

import { UserModel } from "../models/user.model.js";
import {
  DEFAULT_GENERAL_SETTINGS,
  normalizeGeneralSettings,
  notificationSounds,
  type GeneralSettingsPatch,
  type NotificationSound
} from "./general-settings.js";

const expectedDefaults = {
  browserNotificationsEnabled: true,
  notificationSound: "default",
  moveUnreadConversationsToTop: true,
  openNextUnreadConversation: false,
  themeMode: "light",
  accentColor: "blue",
  interfaceDensity: "comfortable",
  messageFontSize: "medium"
} satisfies GeneralSettingsContract;

describe("general settings", () => {
  it("supports exactly the notification sounds shared with API consumers", () => {
    expect(notificationSounds).toEqual(["off", "default", "tri-tone", "clubhouse"]);
    expectTypeOf<NotificationSound>().toEqualTypeOf<ContractNotificationSound>();
  });

  it("uses the approved defaults", () => {
    expect(DEFAULT_GENERAL_SETTINGS).toEqual(expectedDefaults);
  });

  it("normalizes missing and invalid fields independently", () => {
    expect(normalizeGeneralSettings(undefined)).toEqual(expectedDefaults);
    expect(normalizeGeneralSettings({
      browserNotificationsEnabled: false,
      notificationSound: "unsupported",
      moveUnreadConversationsToTop: "yes",
      openNextUnreadConversation: true,
      themeMode: "light",
      accentColor: "blue",
      interfaceDensity: "comfortable",
      messageFontSize: "medium"
    })).toEqual({
      browserNotificationsEnabled: false,
      notificationSound: "default",
      moveUnreadConversationsToTop: true,
      openNextUnreadConversation: true,
      themeMode: "light", accentColor: "blue", interfaceDensity: "comfortable", messageFontSize: "medium"
    });
  });

  it("preserves every valid setting and ignores unrelated values", () => {
    const patch = { notificationSound: "off" } satisfies GeneralSettingsPatch;

    expect(patch).toEqual({ notificationSound: "off" });
    expect(normalizeGeneralSettings({
      browserNotificationsEnabled: false,
      notificationSound: "tri-tone",
      moveUnreadConversationsToTop: false,
      openNextUnreadConversation: true,
      unrelated: "ignored"
    })).toEqual({
      browserNotificationsEnabled: false,
      notificationSound: "tri-tone",
      moveUnreadConversationsToTop: false,
      openNextUnreadConversation: true,
      themeMode: "light",
      accentColor: "blue",
      interfaceDensity: "comfortable",
      messageFontSize: "medium"
    });
  });

  it("normalizes valid appearance options and falls back independently", () => {
    expect(normalizeGeneralSettings({ themeMode: "system", accentColor: "violet", interfaceDensity: "compact", messageFontSize: "large" })).toMatchObject({
      themeMode: "system", accentColor: "violet", interfaceDensity: "compact", messageFontSize: "large"
    });
    expect(normalizeGeneralSettings({ themeMode: "bad", accentColor: "bad", interfaceDensity: "bad", messageFontSize: "bad" })).toMatchObject({
      themeMode: "light", accentColor: "blue", interfaceDensity: "comfortable", messageFontSize: "medium"
    });
  });

  it("applies defaults and validates notification sound in the User schema", async () => {
    const user = new UserModel({
      email: "general-settings@example.com",
      name: "General Settings",
      passwordHash: "hash",
      role: "agent"
    });

    expect(user.generalSettings?.toObject()).toEqual(expectedDefaults);
    await expect(user.validate()).resolves.toBeUndefined();

    const invalidUser = new UserModel({
      email: "invalid-general-settings@example.com",
      name: "Invalid General Settings",
      passwordHash: "hash",
      role: "agent",
      generalSettings: { notificationSound: "unsupported" }
    });

    await expect(invalidUser.validate()).rejects.toThrow(/notificationSound/);
    const invalidAppearanceUser = new UserModel({
      email: "invalid-appearance@example.com", name: "Invalid Appearance", passwordHash: "hash", role: "agent",
      generalSettings: { themeMode: "bad" }
    });
    await expect(invalidAppearanceUser.validate()).rejects.toThrow(/themeMode/);
  });
});
