import { describe, expect, it, vi } from "vitest";
import { connectFacebookPage, createFacebookPost, FacebookPublishingApiError, listFacebookPosts } from "./facebook-publishing.api.js";

describe("Facebook publishing API", () => {
  it("connects with cookie credentials and does not put the token in a URL", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ id: "connection-1", pageId: "page-1", status: "connected" }), { status: 201 }));

    await connectFacebookPage({ pageId: "page-1", pageAccessToken: "secret-token" }, "/api");

    expect(fetchMock).toHaveBeenCalledWith("/api/api/v1/facebook-page/connection", expect.objectContaining({
      credentials: "include",
      method: "POST",
      body: JSON.stringify({ pageId: "page-1", pageAccessToken: "secret-token" })
    }));
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain("secret-token");
    fetchMock.mockRestore();
  });

  it("uses FormData for a post with one image and preserves the safe server error code", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: { code: "INVALID_ATTACHMENT", message: "unsafe" } }), { status: 400 }));
    const image = new File(["image"], "photo.png", { type: "image/png" });

    await expect(createFacebookPost({ message: "Xin chào", mode: "now", image }, "/api")).rejects.toMatchObject({ code: "INVALID_ATTACHMENT" });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.credentials).toBe("include");
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get("message")).toBe("Xin chào");
    expect((init.body as FormData).get("image")).toBe(image);
    fetchMock.mockRestore();
  });

  it("returns typed post lists and turns unknown failures into a safe API error", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("not-json", { status: 503 }));

    await expect(listFacebookPosts(undefined, "/api")).rejects.toBeInstanceOf(FacebookPublishingApiError);
    await expect(listFacebookPosts(undefined, "/api")).rejects.toMatchObject({ code: "FACEBOOK_PUBLISHING_REQUEST_FAILED", status: 503 });
    fetchMock.mockRestore();
  });
});
