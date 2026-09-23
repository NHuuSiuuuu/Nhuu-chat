import * as React from "react";
import { useState } from "react";
import type { AuthRole } from "../../state/auth.store.js";
import { LANDING_PAGE_LINKS } from "../landing/LandingPage.js";
import { LandingFooter } from "../landing/LandingFooter.js";
import { LandingHeader } from "../landing/LandingHeader.js";
import { AuthPage } from "./AuthPage.js";
import { ResetPasswordPage } from "./ResetPasswordPage.js";
import type { AuthRoute } from "./auth-route.js";

interface AuthResponse {
  user: { id: string; email: string; role: AuthRole };
}

export function AuthRoutePage({ route, onNavigateAuth, onAuthenticated, onResetSuccess }: {
  route: AuthRoute;
  onNavigateAuth: (route: AuthRoute) => void;
  onAuthenticated: (auth: AuthResponse) => void;
  onResetSuccess?: () => void;
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const authHeaderLinks = LANDING_PAGE_LINKS.map(([label, hash]) => [label, `/${hash}`] as const);

  return <div className="min-h-screen flex flex-col bg-slate-50">
    <LandingHeader
      user={null}
      landingLinks={authHeaderLinks}
      mobileMenuOpen={mobileMenuOpen}
      onMobileMenuToggle={() => setMobileMenuOpen(open => !open)}
      onDashboard={() => undefined}
      onLogin={() => onNavigateAuth("login")}
      onRegister={() => onNavigateAuth("register")}
      onLogout={() => undefined}
      onMobileLinkClick={() => setMobileMenuOpen(false)}
      brandHref="/"
    />
    <main className="relative isolate flex-grow flex items-center justify-center w-full px-4 pt-28 pb-12 md:pt-32 md:pb-24">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 bottom-0 -z-10 bg-[radial-gradient(ellipse_at_50%_35%,rgba(14,165,233,0.16)_0%,rgba(59,130,246,0.08)_45%,rgba(248,250,252,0)_100%)]" />
    {route === "reset-password" ? <ResetPasswordPage onNavigateLogin={() => onNavigateAuth("login")} onResetSuccess={onResetSuccess ?? (() => onNavigateAuth("login"))} /> : <AuthPage
      key={route}
      initialMode={route === "register" ? "register" : "login"}
      initialView={route}
      onNavigateAuth={onNavigateAuth}
      onAuthenticated={onAuthenticated}
    />}
    </main>
    <LandingFooter />
  </div>;
}
