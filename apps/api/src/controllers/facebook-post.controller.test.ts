import { beforeEach, describe, expect, it, vi } from "vitest";

const serviceMocks = vi.hoisted(() => ({
  createPost: vi.fn(), updatePost: vi.fn(), listPosts: vi.fn(), retryPost: vi.fn(), cancelPost: vi.fn(), listPages: vi.fn()
}));

vi.mock("../services/facebook-post.service.js", () => ({ facebookPostService: serviceMocks }));
vi.mock("../services/facebook-page.service.js", () => ({ facebookPageService: { list: serviceMocks.listPages } }));

import { createFacebookPost, updateFacebookPost, listFacebookPosts, retryFacebookPost, cancelFacebookPost } from "./facebook-post.controller.js";

function responseRecorder() {
  const state: { body?: unknown; statusCode: number } = { statusCode: 200 };
  const response = { json(body: unknown) { state.body = body; return response; }, status(code: number) { state.statusCode = code; return response; }, send() { return response; } };
  return { response, state };
}

describe("Facebook post controller", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    serviceMocks.listPages.mockResolvedValue([{ pageId: "page-1" }]);
  });

  it("filters page-specific reads and implicit publishing to the member's allowed Pages", async () => {
    const workspace = { id: "workspace-1", ownerUserId: "owner-1", role: "staff", allowedPages: ["page-1"] };
    const denied = vi.fn();
    await listFacebookPosts({ auth: { id: "staff-1" }, workspace, query: { pageId: "page-2" } } as never, responseRecorder().response as never, denied);
    expect(denied.mock.calls[0]?.[0]).toMatchObject({ code: "FACEBOOK_PAGE_NOT_FOUND", statusCode: 404 });
    expect(serviceMocks.listPosts).not.toHaveBeenCalled();

    serviceMocks.listPages.mockResolvedValue([{ pageId: "page-1" }, { pageId: "page-2" }]);
    serviceMocks.createPost.mockResolvedValue({ id: "post-1", status: "draft" });
    await createFacebookPost({ auth: { id: "staff-1" }, workspace, body: { message: "Hello", mode: "draft" } } as never, responseRecorder().response as never, vi.fn());
    expect(serviceMocks.createPost).toHaveBeenCalledWith("owner-1", expect.objectContaining({ pageId: "page-1" }));
  });

  it("denies Facebook access when a staff member is assigned only another platform", async () => {
    const workspace = { id: "workspace-1", ownerUserId: "owner-1", role: "staff", allowedPages: [] };
    const list = responseRecorder();
    await listFacebookPosts({ auth: { id: "staff-1" }, workspace, query: {} } as never, list.response as never, vi.fn());
    expect(serviceMocks.listPosts).toHaveBeenCalledWith("owner-1", { pageIds: [] });

    const denied = vi.fn();
    await listFacebookPosts({ auth: { id: "staff-1" }, workspace, query: { pageId: "page-1" } } as never, responseRecorder().response as never, denied);
    expect(denied.mock.calls[0]?.[0]).toMatchObject({ code: "FACEBOOK_PAGE_NOT_FOUND", statusCode: 404 });

    const createDenied = vi.fn();
    await createFacebookPost({ auth: { id: "staff-1" }, workspace, body: { message: "Hello", mode: "draft" } } as never, responseRecorder().response as never, createDenied);
    expect(createDenied.mock.calls[0]?.[0]).toMatchObject({ code: "FACEBOOK_PAGE_ACCESS_DENIED", statusCode: 403 });
    expect(serviceMocks.createPost).not.toHaveBeenCalled();
  });

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
    expect(serviceMocks.updatePost).toHaveBeenCalledWith("user-1", "post-1", { message: "Updated" }, undefined);

    const list = responseRecorder();
    await listFacebookPosts({ auth: { id: "user-1" }, query: { status: "draft" } } as never, list.response as never, vi.fn());
    expect(serviceMocks.listPosts).toHaveBeenCalledWith("user-1", { status: "draft" });

    const retry = responseRecorder();
    await retryFacebookPost({ auth: { id: "user-1" }, params: { id: "post-1" }, body: { mode: "now" } } as never, retry.response as never, vi.fn());
    expect(serviceMocks.retryPost).toHaveBeenCalledWith("user-1", "post-1", "now", undefined);

    const cancel = responseRecorder();
    await cancelFacebookPost({ auth: { id: "user-1" }, params: { id: "post-1" } } as never, cancel.response as never, vi.fn());
    expect(serviceMocks.cancelPost).toHaveBeenCalledWith("user-1", "post-1", undefined);
    expect(cancel.state.statusCode).toBe(204);
  });
});
