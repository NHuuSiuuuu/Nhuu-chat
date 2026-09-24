import { describe, expect, it } from "vitest";

import { aiSettingsRouter } from "./ai-settings.routes.js";

describe("AI settings routes", () => {
  it("exposes authenticated GET and PATCH endpoints", () => {
    const routes = aiSettingsRouter.stack
      .filter((layer) => layer.route)
      .map((layer) => {
        const route = layer.route as unknown as { path: string; methods: Record<string, boolean> };
        return { path: route.path, methods: route.methods };
      });

    expect(routes).toEqual([
      { path: "/", methods: expect.objectContaining({ get: true }) },
      { path: "/", methods: expect.objectContaining({ patch: true }) }
    ]);
  });
});
