import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "../common/errors.js";
import { FacebookPostService } from "./facebook-post.service.js";

const media = {
  secureUrl: "https://cdn.example/post.jpg",
  publicId: "post-1",
  resourceType: "image" as const,
  mimeType: "image/jpeg",
  bytes: 100
};

function row(overrides: Record<string, unknown> = {}) {
  return {
    _id: "post-1",
    userId: "user-1",
    connectionId: "connection-1",
    pageId: "page-1",
    message: "Hello",
    media: null,
    status: "draft",
    scheduledAt: null,
    timezone: "Asia/Ho_Chi_Minh",
    publishedPostId: null,
    attempts: 0,
    lastErrorCode: null,
    lastErrorMessage: null,
    publishingLeaseUntil: null,
    publishedAt: null,
    createdAt: new Date("2026-09-21T10:00:00.000Z"),
    updatedAt: new Date("2026-09-21T10:00:00.000Z"),
    ...overrides
  };
}

function deps() {
  const postModel = {
    create: vi.fn(),
    find: vi.fn(),
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    findOneAndDelete: vi.fn()
  };
  const connectionModel = { findOne: vi.fn() };
  const publisher = { publish: vi.fn() };
  const mediaService = { upload: vi.fn(), destroy: vi.fn() };
  return { postModel, connectionModel, publisher, mediaService };
}

function listQuery(value: unknown) {
  return { sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(value) }) };
}

function connectionQuery(value: unknown) {
  return { select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(value) }) };
}

function updateQuery(value: unknown) {
  return { lean: vi.fn().mockResolvedValue(value) };
}

describe("FacebookPostService", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("persists a draft scoped to the authenticated user and connection", async () => {
    const d = deps();
    d.connectionModel.findOne.mockReturnValue(connectionQuery({ _id: "connection-1", userId: "user-1", pageId: "page-1", status: "connected" }));
    d.postModel.create.mockResolvedValue(row());
    const service = new FacebookPostService({ ...d, now: () => new Date("2026-09-21T10:00:00.000Z") });

    await expect(service.createPost("user-1", { message: "Hello", mode: "draft" })).resolves.toMatchObject({ id: "post-1", status: "draft" });
    expect(d.postModel.create).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1", connectionId: "connection-1", pageId: "page-1", message: "Hello", status: "draft" }));
  });

  it("converts a future Vietnam local schedule to UTC", async () => {
    const d = deps();
    d.connectionModel.findOne.mockReturnValue(connectionQuery({ _id: "connection-1", pageId: "page-1", status: "connected" }));
    d.postModel.create.mockResolvedValue(row({ status: "scheduled", scheduledAt: new Date("2026-09-22T03:00:00.000Z") }));
    const service = new FacebookPostService({ ...d, now: () => new Date("2026-09-21T10:00:00.000Z") });

    await service.createPost("user-1", { message: "Hello", mode: "scheduled", scheduledAt: "2026-09-22T10:00" });

    expect(d.postModel.create).toHaveBeenCalledWith(expect.objectContaining({ status: "scheduled", scheduledAt: new Date("2026-09-22T03:00:00.000Z") }));
  });

  it("publishes immediately and records the published ID and attempt", async () => {
    const d = deps();
    d.connectionModel.findOne.mockReturnValue(connectionQuery({ _id: "connection-1", pageId: "page-1", status: "connected", encryptedPageAccessToken: "cipher" }));
    d.postModel.create.mockResolvedValue(row({ status: "publishing", attempts: 1, media }));
    d.publisher.publish.mockResolvedValue({ publishedPostId: "page-1_99" });
    d.postModel.findOneAndUpdate.mockReturnValue(updateQuery(row({ status: "published", attempts: 1, publishedPostId: "page-1_99" })));
    const service = new FacebookPostService({ ...d, decryptSecret: () => "page-secret", now: () => new Date("2026-09-21T10:00:00.000Z") });

    await expect(service.createPost("user-1", { message: "Hello", mode: "now", media })).resolves.toMatchObject({ status: "published", publishedPostId: "page-1_99" });
    expect(d.publisher.publish).toHaveBeenCalledWith({ pageId: "page-1", pageAccessToken: "page-secret", message: "Hello", mediaUrl: media.secureUrl });
    expect(d.postModel.findOneAndUpdate).toHaveBeenCalledWith(expect.objectContaining({ _id: "post-1", userId: "user-1", status: "publishing" }), expect.objectContaining({ $set: expect.objectContaining({ status: "published" }) }), expect.anything());
  });

  it("records a safe failure and retains uploaded media when publish fails", async () => {
    const d = deps();
    d.connectionModel.findOne.mockReturnValue(connectionQuery({ _id: "connection-1", pageId: "page-1", status: "connected", encryptedPageAccessToken: "cipher" }));
    d.postModel.create.mockResolvedValue(row({ status: "publishing", attempts: 1, media }));
    d.publisher.publish.mockRejectedValue(new AppError(403, "FACEBOOK_PERMISSION_DENIED", "Facebook Page publishing permission was denied"));
    d.postModel.findOneAndUpdate.mockReturnValue(updateQuery(row({ status: "failed", attempts: 1, lastErrorCode: "FACEBOOK_PERMISSION_DENIED", lastErrorMessage: "Facebook Page publishing permission was denied", media })));
    const service = new FacebookPostService({ ...d, decryptSecret: () => "page-secret" });

    await expect(service.createPost("user-1", { message: "Hello", mode: "now", media })).resolves.toMatchObject({ status: "failed", lastErrorCode: "FACEBOOK_PERMISSION_DENIED", media });
    expect(d.mediaService.destroy).not.toHaveBeenCalled();
  });

  it("does not expose or mutate another user's post", async () => {
    const d = deps();
    d.postModel.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    const service = new FacebookPostService(d);

    await expect(service.updatePost("user-2", "post-1", { message: "Nope" })).rejects.toMatchObject({ code: "FACEBOOK_POST_NOT_FOUND", statusCode: 404 });
    expect(d.postModel.findOne).toHaveBeenCalledWith({ _id: "post-1", userId: "user-2" });
  });

  it.each(["published", "publishing"])("rejects updates to %s posts", async (status) => {
    const d = deps();
    d.postModel.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(row({ status })) });
    const service = new FacebookPostService(d);

    await expect(service.updatePost("user-1", "post-1", { message: "Nope" })).rejects.toMatchObject({ code: "FACEBOOK_POST_INVALID_STATE", statusCode: 409 });
  });

  it("retries a failed post and can cancel a scheduled post with media cleanup", async () => {
    const d = deps();
    d.postModel.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(row({ status: "failed", media })) });
    d.connectionModel.findOne.mockReturnValue(connectionQuery({ _id: "connection-1", pageId: "page-1", status: "connected", encryptedPageAccessToken: "cipher" }));
    d.postModel.findOneAndUpdate.mockReturnValueOnce(updateQuery(row({ status: "publishing", attempts: 2, media }))).mockReturnValueOnce(updateQuery(row({ status: "published", publishedPostId: "page-1_2", attempts: 2 })));
    d.publisher.publish.mockResolvedValue({ publishedPostId: "page-1_2" });
    d.postModel.findOneAndDelete.mockReturnValue(updateQuery(row({ status: "scheduled", media })));
    const service = new FacebookPostService({ ...d, decryptSecret: () => "page-secret" });

    await expect(service.retryPost("user-1", "post-1", "now")).resolves.toMatchObject({ status: "published" });
    await service.cancelPost("user-1", "post-1");
    expect(d.postModel.findOneAndDelete).toHaveBeenCalledWith({ _id: "post-1", userId: "user-1", status: { $in: ["draft", "scheduled", "failed"] } });
    expect(d.mediaService.destroy).toHaveBeenCalledWith(media);
  });

  it("rejects a scheduled time in the past", async () => {
    const d = deps();
    d.connectionModel.findOne.mockReturnValue(connectionQuery({ _id: "connection-1", pageId: "page-1", status: "connected" }));
    const service = new FacebookPostService({ ...d, now: () => new Date("2026-09-21T10:00:00.000Z") });

    await expect(service.createPost("user-1", { message: "Hello", mode: "scheduled", scheduledAt: "2026-09-21T16:00" })).rejects.toMatchObject({ code: "FACEBOOK_POST_SCHEDULE_IN_PAST", statusCode: 400 });
  });

  it("lists only posts belonging to the authenticated user", async () => {
    const d = deps();
    d.postModel.find.mockReturnValue(listQuery([row()]));
    const service = new FacebookPostService(d);

    await service.listPosts("user-1", { status: "draft" });
    expect(d.postModel.find).toHaveBeenCalledWith({ userId: "user-1", status: "draft" });
  });
});
