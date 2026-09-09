import { afterEach, describe, expect, it, vi } from "vitest";

import { apiRequest } from "./api.js";

describe("authenticated API requests", () => {
  afterEach(() => vi.restoreAllMocks());

  it("retries once with the refreshed access token after a 401", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "INVALID_TOKEN" } }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const refresh = vi.fn().mockResolvedValue("fresh-access-token");

    await expect(apiRequest<{ ok: boolean }>("", "/protected", "expired-token", {}, refresh)).resolves.toEqual({ ok: true });
    expect(refresh).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[1]?.[1]).toEqual(expect.objectContaining({ headers: expect.objectContaining({ authorization: "Bearer fresh-access-token" }) }));
  });
});
