import { describe, expect, it, vi } from "vitest";

import { clearAuth, loadAuth, saveAuth } from "./auth.store.js";

describe("cookie-backed auth state", () => {
  it("does not read or write auth tokens to localStorage", () => {
    const storage = { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() };
    vi.stubGlobal("localStorage", storage);
    const auth = { user: { id: "user-1", email: "user@example.com", role: "agent" as const } };

    expect(loadAuth()).toBeNull();
    saveAuth(auth);
    clearAuth();

    expect(storage.getItem).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
  });
});
