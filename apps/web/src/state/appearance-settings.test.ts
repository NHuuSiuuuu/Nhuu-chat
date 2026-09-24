import { afterEach, describe, expect, it, vi } from "vitest";

import { applyAppearanceSettings, resetAppearanceSettings } from "./appearance-settings.js";

describe("appearance settings", () => {
afterEach(() => {
  resetAppearanceSettings();
  vi.restoreAllMocks();
    delete (globalThis as { document?: Document }).document;
    delete (globalThis as { window?: Window }).window;
  });

  it("applies selected appearance values to the document root", () => {
    const attributes = new Map<string, string>();
    const root = { setAttribute: (key: string, value: string) => attributes.set(key, value), removeAttribute: (key: string) => attributes.delete(key) };
    vi.stubGlobal("document", { documentElement: root });

    applyAppearanceSettings({ themeMode: "dark", accentColor: "rose", interfaceDensity: "compact", messageFontSize: "large" });

    expect(attributes).toEqual(new Map([
      ["data-theme", "dark"], ["data-accent", "rose"], ["data-density", "compact"], ["data-message-size", "large"]
    ]));
  });

  it("resolves system theme from the operating system preference", () => {
    const attributes = new Map<string, string>();
    const root = { setAttribute: (key: string, value: string) => attributes.set(key, value), removeAttribute: (key: string) => attributes.delete(key) };
    const media = { matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    vi.stubGlobal("document", { documentElement: root });
    vi.stubGlobal("window", { matchMedia: vi.fn(() => media) });

    applyAppearanceSettings({ themeMode: "system", accentColor: "blue", interfaceDensity: "comfortable", messageFontSize: "medium" });

    expect(attributes.get("data-theme")).toBe("dark");
    expect(media.addEventListener).toHaveBeenCalledWith("change", expect.any(Function));
    const listener = media.addEventListener.mock.calls[0]?.[1] as (event: { matches: boolean }) => void;
    listener({ matches: false });
    expect(attributes.get("data-theme")).toBe("light");
  });

  it("resets document attributes and removes the system theme listener", () => {
    const attributes = new Map<string, string>();
    const root = { setAttribute: (key: string, value: string) => attributes.set(key, value), removeAttribute: (key: string) => attributes.delete(key) };
    const media = { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    vi.stubGlobal("document", { documentElement: root });
    vi.stubGlobal("window", { matchMedia: vi.fn(() => media) });
    applyAppearanceSettings({ themeMode: "system", accentColor: "rose", interfaceDensity: "compact", messageFontSize: "large" });

    resetAppearanceSettings();

    expect(attributes).toEqual(new Map([
      ["data-theme", "light"], ["data-accent", "blue"], ["data-density", "comfortable"], ["data-message-size", "medium"]
    ]));
    expect(media.removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
  });
});
