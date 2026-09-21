import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "../common/errors.js";
import { FacebookPostScheduler } from "./facebook-post.scheduler.js";

const now = new Date("2026-09-21T10:00:00.000Z");

function row(overrides: Record<string, unknown> = {}) {
  return {
    _id: "post-1",
    userId: "user-1",
    connectionId: "connection-1",
    pageId: "page-1",
    message: "Hello",
    media: null,
    status: "scheduled",
    scheduledAt: new Date("2026-09-21T09:59:00.000Z"),
    attempts: 0,
    publishingLeaseUntil: null,
    ...overrides
  };
}

function query(value: unknown) {
  return { lean: vi.fn().mockResolvedValue(value) };
}

function dependencies() {
  return {
    postModel: { findOneAndUpdate: vi.fn() },
    connectionModel: { findOne: vi.fn() },
    publisher: { publish: vi.fn() },
    decryptSecret: vi.fn(() => "page-token")
  };
}

function connectedConnection() {
  return { _id: "connection-1", userId: "user-1", pageId: "page-1", status: "connected", encryptedPageAccessToken: "ciphertext" };
}

describe("FacebookPostScheduler", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("claims and publishes a due scheduled post", async () => {
    const d = dependencies();
    d.postModel.findOneAndUpdate
      .mockReturnValueOnce(query(row({ status: "publishing", attempts: 1, publishingLeaseUntil: new Date(now.getTime() + 120_000) })))
      .mockReturnValueOnce(query(row({ status: "published", attempts: 1, publishedPostId: "page-1_1" })));
    d.connectionModel.findOne.mockReturnValue({ select: vi.fn().mockReturnValue(query(connectedConnection())) });
    d.publisher.publish.mockResolvedValue({ publishedPostId: "page-1_1" });

    const scheduler = new FacebookPostScheduler({ ...d, now: () => now, leaseMs: 120_000 });

    await expect(scheduler.runOnce()).resolves.toBe(true);
    expect(d.postModel.findOneAndUpdate).toHaveBeenNthCalledWith(1,
      { status: "scheduled", scheduledAt: { $lte: now } },
      { $set: { status: "publishing", publishingLeaseUntil: new Date(now.getTime() + 120_000) }, $inc: { attempts: 1 } },
      { new: true, runValidators: true }
    );
    expect(d.decryptSecret).toHaveBeenCalledWith("ciphertext");
    expect(d.publisher.publish).toHaveBeenCalledWith({ pageId: "page-1", pageAccessToken: "page-token", message: "Hello" });
    expect(d.postModel.findOneAndUpdate).toHaveBeenNthCalledWith(2,
      { _id: "post-1", status: "publishing" },
      { $set: expect.objectContaining({ status: "published", publishedPostId: "page-1_1", publishingLeaseUntil: null }) },
      { new: true, runValidators: true }
    );
  });

  it("ignores future scheduled posts", async () => {
    const d = dependencies();
    d.postModel.findOneAndUpdate.mockReturnValue(query(null));
    const scheduler = new FacebookPostScheduler({ ...d, now: () => now });

    await expect(scheduler.runOnce()).resolves.toBe(false);
    expect(d.publisher.publish).not.toHaveBeenCalled();
  });

  it("does not publish when another worker wins the atomic claim", async () => {
    const d = dependencies();
    d.postModel.findOneAndUpdate.mockReturnValue(query(null));
    const scheduler = new FacebookPostScheduler({ ...d, now: () => now });

    await expect(scheduler.runOnce()).resolves.toBe(false);
    expect(d.connectionModel.findOne).not.toHaveBeenCalled();
    expect(d.publisher.publish).not.toHaveBeenCalled();
  });

  it("moves an expired publishing lease to a safe failed terminal state", async () => {
    const d = dependencies();
    d.postModel.findOneAndUpdate
      .mockReturnValueOnce(query(null))
      .mockReturnValueOnce(query(row({ status: "failed", lastErrorCode: "FACEBOOK_PUBLISH_LEASE_EXPIRED", publishingLeaseUntil: null })));
    const scheduler = new FacebookPostScheduler({ ...d, now: () => now });

    await expect(scheduler.runOnce()).resolves.toBe(true);
    expect(d.postModel.findOneAndUpdate).toHaveBeenCalledWith(
      { status: "publishing", publishingLeaseUntil: { $lte: now } },
      { $set: { status: "failed", lastErrorCode: "FACEBOOK_PUBLISH_LEASE_EXPIRED", lastErrorMessage: "Facebook publish lease expired; retry requires manual confirmation", publishingLeaseUntil: null } },
      { new: true, runValidators: true }
    );
    expect(d.publisher.publish).not.toHaveBeenCalled();
  });

  it("records a safe terminal failure when publishing fails", async () => {
    const d = dependencies();
    d.postModel.findOneAndUpdate
      .mockReturnValueOnce(query(row({ status: "publishing", attempts: 1 })))
      .mockReturnValueOnce(query(row({ status: "failed", attempts: 1, lastErrorCode: "FACEBOOK_PERMISSION_DENIED" })));
    d.connectionModel.findOne.mockReturnValue({ select: vi.fn().mockReturnValue(query(connectedConnection())) });
    d.publisher.publish.mockRejectedValue(new AppError(403, "FACEBOOK_PERMISSION_DENIED", "Facebook Page publishing permission was denied"));
    const scheduler = new FacebookPostScheduler({ ...d, now: () => now });

    await expect(scheduler.runOnce()).resolves.toBe(true);
    expect(d.postModel.findOneAndUpdate).toHaveBeenNthCalledWith(2,
      { _id: "post-1", status: "publishing" },
      { $set: { status: "failed", lastErrorCode: "FACEBOOK_PERMISSION_DENIED", lastErrorMessage: "Facebook Page publishing permission was denied", publishingLeaseUntil: null } },
      { new: true, runValidators: true }
    );
  });

  it("does not retry an ambiguous publish timeout", async () => {
    const d = dependencies();
    d.postModel.findOneAndUpdate
      .mockReturnValueOnce(query(row({ status: "publishing", attempts: 1 })))
      .mockReturnValueOnce(query(row({ status: "failed", attempts: 1, lastErrorCode: "FACEBOOK_PUBLISH_TIMEOUT" })))
      .mockReturnValueOnce(query(null))
      .mockReturnValueOnce(query(null));
    d.connectionModel.findOne.mockReturnValue({ select: vi.fn().mockReturnValue(query(connectedConnection())) });
    d.publisher.publish.mockRejectedValue(new AppError(504, "FACEBOOK_PUBLISH_TIMEOUT", "Facebook publish timed out"));
    const scheduler = new FacebookPostScheduler({ ...d, now: () => now });

    await scheduler.runOnce();
    await scheduler.runOnce();

    expect(d.publisher.publish).toHaveBeenCalledOnce();
    expect(d.postModel.findOneAndUpdate).toHaveBeenCalledTimes(4);
  });

  it("does not overlap an in-flight run", async () => {
    const d = dependencies();
    let releasePublish!: (value: { publishedPostId: string }) => void;
    d.postModel.findOneAndUpdate
      .mockReturnValueOnce(query(row({ status: "publishing", attempts: 1 })))
      .mockReturnValueOnce(query(row({ status: "published", publishedPostId: "page-1_2" })));
    d.connectionModel.findOne.mockReturnValue({ select: vi.fn().mockReturnValue(query(connectedConnection())) });
    d.publisher.publish.mockReturnValue(new Promise((resolve) => { releasePublish = resolve; }));
    const scheduler = new FacebookPostScheduler({ ...d, now: () => now });

    const firstRun = scheduler.runOnce();
    await Promise.resolve();
    await expect(scheduler.runOnce()).resolves.toBe(false);
    releasePublish({ publishedPostId: "page-1_2" });

    await expect(firstRun).resolves.toBe(true);
    expect(d.publisher.publish).toHaveBeenCalledOnce();
  });

  it("starts one interval and clears it on stop", async () => {
    vi.useFakeTimers();
    const d = dependencies();
    d.postModel.findOneAndUpdate.mockReturnValue(query(null));
    const scheduler = new FacebookPostScheduler({ ...d, intervalMs: 30_000 });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(30_000);
    scheduler.stop();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(d.postModel.findOneAndUpdate).toHaveBeenCalledTimes(4);
    scheduler.stop();
    vi.useRealTimers();
  });
});
