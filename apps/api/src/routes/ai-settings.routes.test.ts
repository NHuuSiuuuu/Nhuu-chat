import { describe, expect, it } from "vitest";

import { aiSettingsRouter } from "./ai-settings.routes.js";

describe("AI settings routes", () => {
  it("exposes authenticated GET and PATCH endpoints", () => {
    const routes = aiSettingsRouter.stack
      .filter((layer) => layer.route)
      .map((layer) => ({ path: layer.route?.path, methods: layer.route?.methods }));

    expect(routes).toEqual([
      { path: "/", methods: expect.objectContaining({ get: true }) },
      { path: "/", methods: expect.objectContaining({ patch: true }) }
    ]);
  });
});
