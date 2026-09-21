import { beforeEach, describe, expect, it, vi } from "vitest";

const serviceMocks = vi.hoisted(() => ({
  createPost: vi.fn(), updatePost: vi.fn(), listPosts: vi.fn(), retryPost: vi.fn(), cancelPost: vi.fn()
}));

vi.mock("../services/facebook-post.service.js", () => ({ facebookPostService: serviceMocks }));

import { createFacebookPost, updateFacebookPost, listFacebookPosts, retryFacebookPost, cancelFacebookPost } from "./facebook-post.controller.js";

function responseRecorder() {
  const state: { body?: unknown; statusCode: number } = { statusCode: 200 };
  const response = { json(body: unknown) { state.body = body; return response; }, status(code: number) { state.statusCode = code; return response; }, send() { return response; } };
  return { response, state };
}

describe("Facebook post controller", () => {
  beforeEach(() => vi.resetAllMocks());

  it("creates a post with authenticated user and uploaded media", async () => {
    serviceMocks.createPost.mockResolvedValue({ id: "post-1", status: "draft" });
    const { response, state } = responseRecorder();
    const file = { buffer: Buffer.from("x"), originalname: "x.jpg", mimetype: "image/jpeg", size: 1 };

    await createFacebookPost({ auth: { id: "user-1" }, body: { message: "Hello", mode: "draft" }, file } as never, response as never, vi.fn());

    expect(serviceMocks.createPost).toHaveBeenCalledWith("user-1", expect.objectContaining({ message: "Hello", mode: "draft", file }));
    expect(state.statusCode).toBe(201);
  });

  it("rejects invalid create data without calling the service", async () => {
    const next = vi.fn();
    const { response } = responseRecorder();
    await createFacebookPost({ auth: { id: "user-1" }, body: { message: "", mode: "draft" } } as never, response as never, next);
    expect(next.mock.calls[0]?.[0]).toMatchObject({ code: "INVALID_REQUEST", statusCode: 400 });
    expect(serviceMocks.createPost).not.toHaveBeenCalled();
  });

  it("updates, lists, retries and cancels with user-scoped IDs", async () => {
    serviceMocks.updatePost.mockResolvedValue({ id: "post-1" });
    serviceMocks.listPosts.mockResolvedValue([]);
    serviceMocks.retryPost.mockResolvedValue({ id: "post-1" });
    const update = responseRecorder();
    await updateFacebookPost({ auth: { id: "user-1" }, params: { id: "post-1" }, body: { message: "Updated" } } as never, update.response as never, vi.fn());
    expect(serviceMocks.updatePost).toHaveBeenCalledWith("user-1", "post-1", { message: "Updated" });

    const list = responseRecorder();
    await listFacebookPosts({ auth: { id: "user-1" }, query: { status: "draft" } } as never, list.response as never, vi.fn());
    expect(serviceMocks.listPosts).toHaveBeenCalledWith("user-1", { status: "draft" });

    const retry = responseRecorder();
    await retryFacebookPost({ auth: { id: "user-1" }, params: { id: "post-1" }, body: { mode: "now" } } as never, retry.response as never, vi.fn());
    expect(serviceMocks.retryPost).toHaveBeenCalledWith("user-1", "post-1", "now");

    const cancel = responseRecorder();
    await cancelFacebookPost({ auth: { id: "user-1" }, params: { id: "post-1" } } as never, cancel.response as never, vi.fn());
    expect(serviceMocks.cancelPost).toHaveBeenCalledWith("user-1", "post-1");
    expect(cancel.state.statusCode).toBe(204);
  });
});
