import { describe, expect, it } from "vitest";

import { generalSettingsPatchSchema } from "./general-settings.schemas.js";

describe("general settings schemas", () => {
  it("accepts a partial settings patch", () => {
    expect(generalSettingsPatchSchema.parse({ notificationSound: "tri-tone" })).toEqual({
      notificationSound: "tri-tone"
    });
  });

  it("accepts supported appearance settings", () => {
    expect(generalSettingsPatchSchema.parse({ themeMode: "system", accentColor: "violet", interfaceDensity: "compact", messageFontSize: "large" })).toEqual({
      themeMode: "system", accentColor: "violet", interfaceDensity: "compact", messageFontSize: "large"
    });
  });

  it.each([
    { notificationSound: "premium" },
    { browserNotificationsEnabled: "yes" },
    { moveUnreadConversationsToTop: 1 },
    { openNextUnreadConversation: null },
    { themeMode: "sepia" },
    { accentColor: "orange" },
    { interfaceDensity: "dense" },
    { messageFontSize: "huge" },
    { ownerId: "user-2" }
  ])("rejects invalid or unsupported patch values: %j", (patch) => {
    expect(generalSettingsPatchSchema.safeParse(patch).success).toBe(false);
  });
});
