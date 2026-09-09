import { describe, expect, it } from "vitest";

import { resolveLandingPage } from "./onboarding.js";

describe("post-login onboarding", () => {
  it("lands on the dashboard regardless of channel connection state", () => {
    expect(resolveLandingPage({ telegramPersonalConnected: false })).toBe("dashboard");
    expect(resolveLandingPage({ telegramPersonalConnected: true })).toBe("dashboard");
  });
});
