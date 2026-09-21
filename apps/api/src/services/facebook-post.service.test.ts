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

  it("validates a schedule before uploading media", async () => {
    const d = deps();
    d.connectionModel.findOne.mockReturnValue(connectionQuery({ _id: "connection-1", pageId: "page-1", status: "connected" }));
    const service = new FacebookPostService({ ...d, now: () => new Date("2026-09-21T10:00:00.000Z") });

    await expect(service.createPost("user-1", { message: "Hello", mode: "scheduled", scheduledAt: "2026-09-21T09:00", file: {} as Express.Multer.File })).rejects.toMatchObject({ code: "FACEBOOK_POST_SCHEDULE_IN_PAST" });
    expect(d.mediaService.upload).not.toHaveBeenCalled();
    expect(d.mediaService.destroy).not.toHaveBeenCalled();
  });

  it("destroys newly uploaded media when draft persistence fails", async () => {
    const d = deps();
    const uploaded = { ...media, publicId: "new-media" };
    d.connectionModel.findOne.mockReturnValue(connectionQuery({ _id: "connection-1", pageId: "page-1", status: "connected" }));
    d.mediaService.upload.mockResolvedValue(uploaded);
    d.postModel.create.mockRejectedValue(new Error("database unavailable"));
    const service = new FacebookPostService(d);

    await expect(service.createPost("user-1", { message: "Hello", mode: "draft", file: {} as Express.Multer.File })).rejects.toThrow("database unavailable");
    expect(d.mediaService.destroy).toHaveBeenCalledWith(uploaded);
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

  it("assigns a recovery lease before publishing immediately", async () => {
    const d = deps();
    const now = new Date("2026-09-21T10:00:00.000Z");
    d.connectionModel.findOne.mockReturnValue(connectionQuery({ _id: "connection-1", pageId: "page-1", status: "connected", encryptedPageAccessToken: "cipher" }));
    d.postModel.create.mockResolvedValue(row({ status: "publishing", attempts: 1 }));
    d.publisher.publish.mockResolvedValue({ publishedPostId: "page-1_100" });
    d.postModel.findOneAndUpdate.mockReturnValue(updateQuery(row({ status: "published", publishedPostId: "page-1_100" })));
    const service = new FacebookPostService({ ...d, decryptSecret: () => "page-secret", now: () => now });

    await service.createPost("user-1", { message: "Hello", mode: "now" });

    expect(d.postModel.create).toHaveBeenCalledWith(expect.objectContaining({
      status: "publishing",
      attempts: 1,
      publishingLeaseUntil: new Date("2026-09-21T10:02:00.000Z")
    }));
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

  it("schedules a draft when a future time is supplied", async () => {
    const d = deps();
    d.postModel.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(row({ status: "draft", scheduledAt: null })) });
    d.postModel.findOneAndUpdate.mockReturnValue(updateQuery(row({ status: "scheduled", scheduledAt: new Date("2026-09-22T03:00:00.000Z") })));
    const service = new FacebookPostService({ ...d, now: () => new Date("2026-09-21T10:00:00.000Z") });

    await expect(service.updatePost("user-1", "post-1", { scheduledAt: "2026-09-22T10:00" })).resolves.toMatchObject({ status: "scheduled" });
    expect(d.postModel.findOneAndUpdate).toHaveBeenCalledWith(expect.anything(), { $set: expect.objectContaining({ status: "scheduled", scheduledAt: new Date("2026-09-22T03:00:00.000Z") }) }, expect.anything());
  });

  it("returns a scheduled post to draft when its schedule is cleared", async () => {
    const d = deps();
    d.postModel.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(row({ status: "scheduled", scheduledAt: new Date("2026-09-22T03:00:00.000Z") })) });
    d.postModel.findOneAndUpdate.mockReturnValue(updateQuery(row({ status: "draft", scheduledAt: null })));
    const service = new FacebookPostService(d);

    await expect(service.updatePost("user-1", "post-1", { scheduledAt: null })).resolves.toMatchObject({ status: "draft", scheduledAt: null });
    expect(d.postModel.findOneAndUpdate).toHaveBeenCalledWith(expect.anything(), { $set: expect.objectContaining({ status: "draft", scheduledAt: null }) }, expect.anything());
  });

  it("cleans new media and preserves old media when replacement persistence fails", async () => {
    const d = deps();
    const oldMedia = { ...media, publicId: "old-media" };
    const newMedia = { ...media, publicId: "new-media" };
    d.postModel.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(row({ status: "draft", media: oldMedia })) });
    d.mediaService.upload.mockResolvedValue(newMedia);
    d.postModel.findOneAndUpdate.mockReturnValue(updateQuery(null));
    const service = new FacebookPostService(d);

    await expect(service.updatePost("user-1", "post-1", { message: "Updated", file: {} as Express.Multer.File })).rejects.toMatchObject({ code: "FACEBOOK_POST_STATE_CHANGED" });
    expect(d.mediaService.destroy).toHaveBeenCalledWith(newMedia);
    expect(d.mediaService.destroy).not.toHaveBeenCalledWith(oldMedia);
  });

  it("destroys replaced old media only after a successful update", async () => {
    const d = deps();
    const oldMedia = { ...media, publicId: "old-media" };
    const newMedia = { ...media, publicId: "new-media" };
    d.postModel.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(row({ status: "draft", media: oldMedia })) });
    d.mediaService.upload.mockResolvedValue(newMedia);
    d.postModel.findOneAndUpdate.mockReturnValue(updateQuery(row({ status: "draft", media: newMedia })));
    const service = new FacebookPostService(d);

    await service.updatePost("user-1", "post-1", { file: {} as Express.Multer.File });
    expect(d.mediaService.destroy).toHaveBeenCalledWith(oldMedia);
  });

  it.each([
    "2026-02-30T10:00",
    "2026-09-22T10:00Z",
    "2026-09-22T10:00+08:00"
  ])("rejects invalid or non-Vietnam schedule %s", async (scheduledAt) => {
    const d = deps();
    d.connectionModel.findOne.mockReturnValue(connectionQuery({ _id: "connection-1", pageId: "page-1", status: "connected" }));
    const service = new FacebookPostService({ ...d, now: () => new Date("2026-09-21T10:00:00.000Z") });

    await expect(service.createPost("user-1", { message: "Hello", mode: "scheduled", scheduledAt })).rejects.toMatchObject({ code: "INVALID_REQUEST", statusCode: 400 });
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
    expect(d.postModel.findOneAndUpdate).toHaveBeenNthCalledWith(1,
      { _id: "post-1", userId: "user-1", status: "failed" },
      { $set: expect.objectContaining({ status: "publishing", publishingLeaseUntil: expect.any(Date) }) },
      expect.anything()
    );
    await service.cancelPost("user-1", "post-1");
    expect(d.postModel.findOneAndDelete).toHaveBeenCalledWith({ _id: "post-1", userId: "user-1", status: { $in: ["draft", "scheduled", "failed"] } });
    expect(d.mediaService.destroy).toHaveBeenCalledWith(media);
  });

  it("keeps the post when cancellation media cleanup fails", async () => {
    const d = deps();
    d.postModel.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(row({ status: "scheduled", media })) });
    d.postModel.findOneAndDelete.mockReturnValue(updateQuery(row({ status: "scheduled", media })));
    d.mediaService.destroy.mockRejectedValue(new Error("cloudinary unavailable"));
    const service = new FacebookPostService(d);

    await expect(service.cancelPost("user-1", "post-1")).rejects.toMatchObject({
      code: "FACEBOOK_POST_MEDIA_CLEANUP_FAILED",
      statusCode: 502
    });
    expect(d.postModel.findOneAndDelete).not.toHaveBeenCalled();
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
