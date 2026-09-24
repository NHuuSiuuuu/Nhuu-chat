import type { AccentColor, InterfaceDensity, MessageFontSize, ThemeMode } from "@nhuu-chat/contracts";

export interface AppearanceSettings {
  themeMode: ThemeMode;
  accentColor: AccentColor;
  interfaceDensity: InterfaceDensity;
  messageFontSize: MessageFontSize;
}

export const DEFAULT_APPEARANCE_SETTINGS: AppearanceSettings = {
  themeMode: "light",
  accentColor: "blue",
  interfaceDensity: "comfortable",
  messageFontSize: "medium"
};

let activeMediaQuery: MediaQueryList | null = null;
let activeMediaListener: ((event: MediaQueryListEvent) => void) | null = null;

function removeSystemThemeListener() {
  if (activeMediaQuery && activeMediaListener) {
    activeMediaQuery.removeEventListener("change", activeMediaListener);
  }
  activeMediaQuery = null;
  activeMediaListener = null;
}

function prefersDarkTheme(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function applyAppearanceSettings(settings: AppearanceSettings): void {
  if (typeof document === "undefined") return;
  removeSystemThemeListener();
  const root = document.documentElement;
  root.setAttribute("data-theme", settings.themeMode === "system" ? (prefersDarkTheme() ? "dark" : "light") : settings.themeMode);
  root.setAttribute("data-accent", settings.accentColor);
  root.setAttribute("data-density", settings.interfaceDensity);
  root.setAttribute("data-message-size", settings.messageFontSize);

  if (settings.themeMode === "system" && typeof window !== "undefined") {
    activeMediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    activeMediaListener = (event) => root.setAttribute("data-theme", event.matches ? "dark" : "light");
    activeMediaQuery.addEventListener("change", activeMediaListener);
  }
}

export function resetAppearanceSettings(): void {
  removeSystemThemeListener();
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.setAttribute("data-theme", DEFAULT_APPEARANCE_SETTINGS.themeMode);
  root.setAttribute("data-accent", DEFAULT_APPEARANCE_SETTINGS.accentColor);
  root.setAttribute("data-density", DEFAULT_APPEARANCE_SETTINGS.interfaceDensity);
  root.setAttribute("data-message-size", DEFAULT_APPEARANCE_SETTINGS.messageFontSize);
}
