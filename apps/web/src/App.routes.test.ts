import { describe, expect, it } from "vitest";
import { pageFromPath } from "./App.js";

describe("pageFromPath authentication routes", () => {
  it.each([["/login", "login"], ["/register", "register"], ["/forgot-password", "forgot-password"], ["/reset-password", "reset-password"]] as const)("keeps %s as a distinct authentication route", (path, route) => {
    expect(pageFromPath(path)).toBe(route);
  });

  it("keeps the existing landing and dashboard routes", () => {
    expect(pageFromPath("/")).toBe("landing");
    expect(pageFromPath("/dashboard")).toBe("dashboard");
  });
});

describe("global intro visibility", () => {
  it("does not cover standalone authentication pages", async () => {
    const { shouldRenderIntro } = await import("./App.js");
    expect(shouldRenderIntro(true, "register")).toBe(false);
    expect(shouldRenderIntro(true, "reset-password")).toBe(false);
    expect(shouldRenderIntro(false, "landing")).toBe(false);
    expect(shouldRenderIntro(true, "landing")).toBe(true);
  });
});
