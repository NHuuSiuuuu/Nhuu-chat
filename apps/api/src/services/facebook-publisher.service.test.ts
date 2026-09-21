import { describe, expect, it, vi } from "vitest";

import { FacebookPublisher } from "./facebook-publisher.service.js";

function response(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init
  });
}

describe("FacebookPublisher", () => {
  it("publishes text to the Page feed and returns only the post ID", async () => {
    const fetchGraph = vi.fn().mockResolvedValue(response({ id: "page_1_123" }));
    const publisher = new FacebookPublisher({ fetchGraph, graphApiVersion: "v26.0" });

    await expect(publisher.publish({
      pageId: "page_1",
      pageAccessToken: "secret-token",
      message: "Hello"
    })).resolves.toEqual({ publishedPostId: "page_1_123" });

    expect(fetchGraph).toHaveBeenCalledWith(
      "https://graph.facebook.com/v26.0/page_1/feed",
      expect.objectContaining({ method: "POST", body: expect.any(URLSearchParams) })
    );
    const request = fetchGraph.mock.calls[0]?.[1] as RequestInit;
    expect(request.body).toEqual(new URLSearchParams({ access_token: "secret-token", message: "Hello" }));
  });

  it("publishes an image to the Page photo endpoint with a caption", async () => {
    const fetchGraph = vi.fn().mockResolvedValue(response({ id: "photo_1" }));
    const publisher = new FacebookPublisher({ fetchGraph, graphApiVersion: "v27.0" });

    await expect(publisher.publish({
      pageId: "page_1",
      pageAccessToken: "secret-token",
      message: "Caption",
      mediaUrl: "https://res.cloudinary.com/example/photo.jpg"
    })).resolves.toEqual({ publishedPostId: "photo_1" });

    expect(fetchGraph).toHaveBeenCalledWith(
      "https://graph.facebook.com/v27.0/page_1/photos",
      expect.objectContaining({ method: "POST" })
    );
    const request = fetchGraph.mock.calls[0]?.[1] as RequestInit;
    expect(request.body).toEqual(new URLSearchParams({
      access_token: "secret-token",
      caption: "Caption",
      url: "https://res.cloudinary.com/example/photo.jpg"
    }));
  });

  it.each([
    [190, "FACEBOOK_TOKEN_INVALID"],
    [200, "FACEBOOK_PERMISSION_DENIED"],
    [4, "FACEBOOK_RATE_LIMITED"]
  ])("maps Graph code %s to %s without exposing the token", async (graphCode, stableCode) => {
    const token = "super-secret-token";
    const fetchGraph = vi.fn().mockResolvedValue(response({ error: { code: graphCode, message: token } }, { status: 400 }));
    const publisher = new FacebookPublisher({ fetchGraph });

    const error = await publisher.publish({ pageId: "page_1", pageAccessToken: token, message: "Hello" }).catch((value) => value);

    expect(error).toMatchObject({ code: stableCode });
    expect(error.message).not.toContain(token);
  });

  it("maps a timeout to a stable error without exposing the token", async () => {
    const token = "super-secret-token";
    const fetchGraph = vi.fn().mockRejectedValue(new DOMException("The operation timed out", "TimeoutError"));
    const publisher = new FacebookPublisher({ fetchGraph });

    const error = await publisher.publish({ pageId: "page_1", pageAccessToken: token, message: "Hello" }).catch((value) => value);

    expect(error).toMatchObject({ code: "FACEBOOK_PUBLISH_TIMEOUT" });
    expect(error.message).not.toContain(token);
  });
});
