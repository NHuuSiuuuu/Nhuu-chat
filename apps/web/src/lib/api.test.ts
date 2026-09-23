import { afterEach, describe, expect, it, vi } from "vitest";

import { ACTIVE_WORKSPACE_USER_STORAGE_KEY, activeWorkspaceStorageKey, apiRequest, getActiveWorkspaceId, setActiveWorkspaceSelection } from "./api.js";

describe("authenticated API requests", () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("retries once with cookie credentials after a 401", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "INVALID_TOKEN" } }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const refresh = vi.fn().mockResolvedValue(true);

    await expect(apiRequest<{ ok: boolean }>("", "/protected", "", {}, refresh)).resolves.toEqual({ ok: true });
    expect(refresh).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ credentials: "include" }));
    expect(fetchMock.mock.calls[0]?.[1]).not.toEqual(expect.objectContaining({ headers: expect.objectContaining({ authorization: expect.any(String) }) }));
  });

  it("accepts a successful 204 response without parsing an empty body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));

    await expect(apiRequest<void>("", "/conversation-tags/tag-1", "", { method: "DELETE" })).resolves.toBeUndefined();
  });

  it("disables browser caching for API responses that may change during polling", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await apiRequest<{ ok: boolean }>("", "/channels/zalo-personal/qr/qr-1", "");

    expect(fetchMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ cache: "no-store" }));
  });

  it("always sends credentials and never serializes an auth token", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await apiRequest<{ ok: boolean }>("", "/protected", "secret-that-must-not-be-used");

    const options = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(options.credentials).toBe("include");
    expect(JSON.stringify(options)).not.toContain("secret-that-must-not-be-used");
  });

  it("attaches the selected Workspace ID without changing cookie authentication", async () => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
    setActiveWorkspaceSelection("user-1", "workspace-1");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await apiRequest<{ ok: boolean }>("", "/conversations", "");
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).headers).toEqual(expect.objectContaining({ "x-workspace-id": "workspace-1" }));
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ credentials: "include" }));
  });

  it("keeps each signed-in user's Workspace selection separate", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
    setActiveWorkspaceSelection("user-1", "workspace-1");
    setActiveWorkspaceSelection("user-2", "workspace-2");

    expect(values.get(ACTIVE_WORKSPACE_USER_STORAGE_KEY)).toBe("user-2");
    expect(values.get(activeWorkspaceStorageKey("user-1"))).toBe("workspace-1");
    expect(getActiveWorkspaceId()).toBe("workspace-2");
  });
});
