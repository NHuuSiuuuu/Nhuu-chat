import { describe, expect, it } from "vitest";
import { authRouteFromPath } from "./auth-route.js";

describe("authRouteFromPath", () => {
  it.each([["/login", "login"], ["/register", "register"], ["/forgot-password", "forgot-password"], ["/reset-password", "reset-password"]] as const)("recognizes %s", (path, expected) => {
    expect(authRouteFromPath(path)).toBe(expected);
  });

  it("does not classify other routes as public authentication pages", () => {
    expect(authRouteFromPath("/dashboard")).toBeNull();
    expect(authRouteFromPath("/login/extra")).toBeNull();
  });
});

describe("authenticated auth-route redirect", () => {
  it("redirects signed-in users away from auth pages", async () => {
    const { authenticatedAuthRedirect } = await import("./auth-route.js");
    expect(authenticatedAuthRedirect(true, "/login")).toBe("/dashboard");
    expect(authenticatedAuthRedirect(true, "/register")).toBe("/dashboard");
    expect(authenticatedAuthRedirect(true, "/forgot-password")).toBe("/dashboard");
    expect(authenticatedAuthRedirect(true, "/reset-password")).toBeNull();
  });

  it("leaves public auth pages available while signed out", async () => {
    const { authenticatedAuthRedirect } = await import("./auth-route.js");
    expect(authenticatedAuthRedirect(false, "/login")).toBeNull();
    expect(authenticatedAuthRedirect(true, "/dashboard")).toBeNull();
    expect(authenticatedAuthRedirect(false, "/reset-password")).toBeNull();
  });
});
