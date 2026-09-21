import { describe, expect, it, vi } from "vitest";
import { cancelFacebookPost, connectFacebookPage, createFacebookPost, FacebookPublishingApiError, listFacebookPosts, removeFacebookPage, retryFacebookPost, updateFacebookPost } from "./facebook-publishing.api.js";

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

  it("clears a schedule with JSON null because the backend update schema accepts null", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ id: "post-1", status: "draft" }), { status: 200 }));

    await updateFacebookPost("post-1", { scheduledAt: null }, "/api");

    expect(fetchMock).toHaveBeenCalledWith("/api/api/v1/facebook-page/posts/post-1", expect.objectContaining({
      method: "PATCH",
      credentials: "include",
      body: JSON.stringify({ scheduledAt: null })
    }));
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).headers).toEqual({ "content-type": "application/json" });
    fetchMock.mockRestore();
  });

  it("keeps multipart when clearing a schedule while replacing its image", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ id: "post-1", status: "draft" }), { status: 200 }));
    const image = new File(["image"], "replacement.png", { type: "image/png" });

    await updateFacebookPost("post-1", { scheduledAt: null, image }, "/api");

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get("scheduledAt")).toBeNull();
    expect((init.body as FormData).get("mode")).toBe("draft");
    expect((init.body as FormData).get("image")).toBe(image);
    fetchMock.mockRestore();
  });

  it("forces draft mode when clearing a schedule despite a scheduled caller mode", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ id: "post-1", status: "draft" }), { status: 200 }));
    const image = new File(["image"], "replacement.png", { type: "image/png" });

    await updateFacebookPost("post-1", { scheduledAt: null, mode: "scheduled", image }, "/api");

    const body = fetchMock.mock.calls[0]?.[1]?.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get("mode")).toBe("draft");
    expect(body.get("scheduledAt")).toBeNull();
    expect(body.get("image")).toBe(image);
    fetchMock.mockRestore();
  });

  it("handles delete 204 and sends the retry payload", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "post-1", status: "scheduled" }), { status: 200 }));

    await removeFacebookPage("/api");
    await cancelFacebookPost("post-1", "/api");
    await retryFacebookPost("post-1", "scheduled", "/api");

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/api/v1/facebook-page/connection", expect.objectContaining({ method: "DELETE", credentials: "include" }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/api/v1/facebook-page/posts/post-1", expect.objectContaining({ method: "DELETE", credentials: "include" }));
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/api/v1/facebook-page/posts/post-1/retry", expect.objectContaining({ method: "POST", body: JSON.stringify({ mode: "scheduled" }) }));
    fetchMock.mockRestore();
  });

  it.each([
    ["FACEBOOK_PAGE_TOKEN_INVALID", "Token Facebook Page không hợp lệ hoặc đã hết hạn."],
    ["FACEBOOK_PAGE_ID_MISMATCH", "Facebook Page không khớp với Page ID đã nhập."]
  ])("maps backend error code %s to a safe message", async (code, message) => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: { code } }), { status: 400 }));

    await expect(connectFacebookPage({ pageId: "page-1", pageAccessToken: "secret" }, "/api")).rejects.toMatchObject({ code, message });
    fetchMock.mockRestore();
  });

  it.each([
    ["remove", () => removeFacebookPage("/api"), "FACEBOOK_PAGE_NOT_CONNECTED"],
    ["cancel", () => cancelFacebookPost("post-1", "/api"), "FACEBOOK_POST_INVALID_STATE"],
    ["retry", () => retryFacebookPost("post-1", "now", "/api"), "FACEBOOK_POST_INVALID_STATE"]
  ])("preserves rejected %s action error codes and safe messages", async (_name, action, code) => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: { code } }), { status: 409 }));

    await expect(action()).rejects.toMatchObject({ code, status: 409, message: expect.any(String) });
    fetchMock.mockRestore();
  });
});
