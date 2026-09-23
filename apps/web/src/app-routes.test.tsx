import * as React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { ApplicationRoutes } from "./app-routes.js";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function CurrentPath() {
  const location = useLocation();
  return <span>{location.pathname}</span>;
}

async function renderAt(path: string, isAuthenticated: boolean): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ApplicationRoutes
          isAuthenticated={isAuthenticated}
          isLoading={false}
          fallback={<p role="status">loading</p>}
          landing={<p>landing page</p>}
          authPages={{
            login: <p>login page</p>,
            register: <p>register page</p>,
            "forgot-password": <p>forgot password page</p>,
            "reset-password": <p>reset password page</p>
          }}
          privatePage={<CurrentPath />}
        />
      </MemoryRouter>
    );
  });
  return renderer;
}

describe("application route groups", () => {
  it("keeps landing and authentication routes public", async () => {
    for (const [path, content] of [["/", "landing page"], ["/login", "login page"], ["/register", "register page"], ["/forgot-password", "forgot password page"], ["/reset-password", "reset password page"]] as const) {
      const renderer = await renderAt(path, false);
      expect(renderer.root.findByType("p").children).toEqual([content]);
    }
  });

  it.each(["/dashboard", "/inbox", "/settings/general", "/telegram", "/posts", "/profile", "/orders", "/analytics"])("redirects signed-out direct access to private route %s", async (path) => {
    const renderer = await renderAt(path, false);

    expect(renderer.root.findByType("p").children).toEqual(["login page"]);
  });

  it("renders a private route after session verification", async () => {
    const renderer = await renderAt("/settings/general", true);

    expect(renderer.root.findByType("span").children).toEqual(["/settings/general"]);
  });
});
