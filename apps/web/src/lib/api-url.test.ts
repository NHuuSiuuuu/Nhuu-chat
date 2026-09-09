import { describe, expect, it } from "vitest";

import { resolveApiBaseUrl } from "./api-url.js";

describe("resolveApiBaseUrl", () => {
  it("uses the current web origin when no API URL is configured", () => {
    expect(resolveApiBaseUrl(undefined)).toBe("");
  });

  it("preserves an explicitly configured API URL", () => {
    expect(resolveApiBaseUrl("https://api.example.com")).toBe("https://api.example.com");
  });
});
