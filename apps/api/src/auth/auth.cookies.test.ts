import { afterEach, describe, expect, it, vi } from "vitest";

import { clearAuthCookies, readCookie, setAuthCookies } from "./auth.cookies.js";

const response = () => ({ setHeader: vi.fn() });

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("auth cookies", () => {
  it("reads one named value from a Cookie header without exposing other values", () => {
    expect(readCookie({ header: () => "theme=dark; nhuu_access_token=access%20token; empty=" } as never, "nhuu_access_token")).toBe("access token");
    expect(readCookie({ header: () => "theme=dark" } as never, "nhuu_access_token")).toBeUndefined();
  });

  it("sets HttpOnly access and refresh cookies with development flags", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("AUTH_COOKIE_SAME_SITE", "lax");
    const result = response();

    setAuthCookies(result as never, { accessToken: "access", refreshToken: "refresh" });

    expect(result.setHeader).toHaveBeenCalledWith("Set-Cookie", [
      expect.stringContaining("nhuu_access_token=access"),
      expect.stringContaining("nhuu_refresh_token=refresh")
    ]);
    const cookies = result.setHeader.mock.calls[0]?.[1] as string[];
    expect(cookies.every((cookie) => cookie.includes("HttpOnly") && cookie.includes("Path=/") && cookie.includes("SameSite=Lax"))).toBe(true);
    expect(cookies.every((cookie) => !cookie.includes("Secure"))).toBe(true);
  });

  it("requires Secure when production uses SameSite=None", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_COOKIE_SAME_SITE", "none");
    const result = response();

    setAuthCookies(result as never, { accessToken: "access", refreshToken: "refresh" });

    const cookies = result.setHeader.mock.calls[0]?.[1] as string[];
    expect(cookies.every((cookie) => cookie.includes("Secure") && cookie.includes("SameSite=None"))).toBe(true);
  });

  it("clears both cookies without retaining token values", () => {
    const result = response();

    clearAuthCookies(result as never);

    const cookies = result.setHeader.mock.calls[0]?.[1] as string[];
    expect(cookies).toEqual([
      expect.stringContaining("nhuu_access_token=;"),
      expect.stringContaining("nhuu_refresh_token=;")
    ]);
    expect(cookies.every((cookie) => cookie.includes("Max-Age=0") && cookie.includes("HttpOnly"))).toBe(true);
  });
});
