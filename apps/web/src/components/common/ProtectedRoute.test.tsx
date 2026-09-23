import * as React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { ProtectedRoute } from "./ProtectedRoute.js";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function CurrentPath() {
  const location = useLocation();
  return <span>{location.pathname}</span>;
}

async function renderProtectedRoute(isAuthenticated: boolean, isLoading: boolean): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      <MemoryRouter initialEntries={["/private"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/login" element={<CurrentPath />} />
          <Route element={<ProtectedRoute isAuthenticated={isAuthenticated} isLoading={isLoading} />}>
            <Route path="/private" element={<span>private content</span>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );
  });
  return renderer;
}

describe("ProtectedRoute", () => {
  it("redirects a verified signed-out visitor to login", async () => {
    const renderer = await renderProtectedRoute(false, false);

    expect(renderer.root.findByType("span").children).toEqual(["/login"]);
    expect(renderer.root.findAllByProps({ children: "private content" })).toHaveLength(0);
  });

  it("renders the private outlet for a verified signed-in visitor", async () => {
    const renderer = await renderProtectedRoute(true, false);

    expect(renderer.root.findByType("span").children).toEqual(["private content"]);
  });

  it("shows a loading status until session verification finishes", async () => {
    const renderer = await renderProtectedRoute(false, true);

    expect(renderer.root.findByProps({ role: "status" })).toBeTruthy();
    expect(renderer.root.findAllByType("span")).toHaveLength(0);
  });
});
