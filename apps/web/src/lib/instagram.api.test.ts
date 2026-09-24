import { describe, expect, it, vi } from "vitest";

import { getInstagramConnections, removeInstagramConnection, startInstagramOAuth } from "./instagram.api.js";

describe("Instagram API client", () => {
  it("starts OAuth with credentials and a safe server response", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ authorizationUrl: "https://www.instagram.com/oauth/authorize" }), { status: 200 }));
    await expect(startInstagramOAuth("/api")).resolves.toHaveProperty("authorizationUrl");
    expect(fetchMock).toHaveBeenCalledWith("/api/api/v1/instagram/oauth/start", expect.objectContaining({ method: "GET", credentials: "include" }));
    fetchMock.mockRestore();
  });

  it("lists and disconnects by encoded connection ID", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ connections: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ disconnected: true }), { status: 200 }));
    await expect(getInstagramConnections("/api")).resolves.toEqual([]);
    await expect(removeInstagramConnection("id/1", "/api")).resolves.toEqual({ disconnected: true });
    expect(fetchMock.mock.calls[1][0]).toBe("/api/api/v1/instagram/connections/id%2F1");
    fetchMock.mockRestore();
  });
});
