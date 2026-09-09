export type LandingPage = "dashboard";

export function resolveLandingPage(_status: { telegramPersonalConnected: boolean }): LandingPage {
  return "dashboard";
}
