import { afterEach, describe, expect, it, vi } from "vitest";

import { apiRequest } from "./api.js";

describe("authenticated API requests", () => {
  afterEach(() => vi.restoreAllMocks());

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
});
