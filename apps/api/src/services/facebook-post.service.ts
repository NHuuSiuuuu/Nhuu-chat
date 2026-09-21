import type { FacebookPostMedia, FacebookPostResponse } from "@nhuu-chat/contracts";
import { env } from "@nhuu-chat/config";

import { decryptSecret } from "../common/crypto.js";
import { AppError } from "../common/errors.js";
import { FacebookPageConnectionModel } from "../models/facebook-page-connection.model.js";
import { FacebookPostModel } from "../models/facebook-post.model.js";
import { FacebookPostMediaService, facebookPostMediaService } from "./facebook-post-media.service.js";
import { FacebookPublisher, facebookPublisher } from "./facebook-publisher.service.js";

type PostRecord = {
  _id: unknown; userId: unknown; connectionId: unknown; pageId: string; message: string;
  media?: FacebookPostMedia | null; status: FacebookPostResponse["status"];
  scheduledAt?: Date | null; timezone: "Asia/Ho_Chi_Minh"; publishedPostId?: string | null;
  attempts: number; lastErrorCode?: string | null; lastErrorMessage?: string | null;
  publishingLeaseUntil?: Date | null; publishedAt?: Date | null; createdAt: Date; updatedAt: Date;
};

type ConnectionRecord = { _id: unknown; pageId: string; status: "connected" | "invalid"; encryptedPageAccessToken?: string };
type Query<T> = { lean(): Promise<T> };

interface PostModelLike {
  create(value: Record<string, unknown>): Promise<PostRecord>;
  find(filter: Record<string, unknown>): { sort(value: Record<string, unknown>): Query<PostRecord[]> };
  findOne(filter: Record<string, unknown>): Query<PostRecord | null>;
  findOneAndUpdate(filter: Record<string, unknown>, update: Record<string, unknown>, options?: Record<string, unknown>): Query<PostRecord | null>;
  findOneAndDelete(filter: Record<string, unknown>): Query<PostRecord | null>;
}

interface ConnectionModelLike { findOne(filter: Record<string, unknown>): { select(fields: string): Query<ConnectionRecord | null> } }

export type FacebookPostServiceDependencies = {
  postModel?: PostModelLike;
  connectionModel?: ConnectionModelLike;
  publisher?: Pick<FacebookPublisher, "publish">;
  mediaService?: Pick<FacebookPostMediaService, "upload" | "destroy">;
  decryptSecret?: (value: string) => string;
  now?: () => Date;
};

export type CreatePostInput = {
  message: string;
  mode: "draft" | "now" | "scheduled";
  scheduledAt?: string;
  file?: Express.Multer.File;
  media?: FacebookPostMedia;
};

export type UpdatePostInput = { message?: string; mode?: "draft" | "scheduled"; scheduledAt?: string | null; file?: Express.Multer.File };
export type ListPostFilters = { status?: FacebookPostResponse["status"] };

const TIMEZONE = "Asia/Ho_Chi_Minh" as const;

function id(value: unknown): string { return String(value); }
function iso(value: Date | string | null | undefined): string | null { return value ? new Date(value).toISOString() : null; }

function toResponse(record: PostRecord): FacebookPostResponse {
  return {
    id: id(record._id), connectionId: id(record.connectionId), pageId: record.pageId, message: record.message,
    ...(record.media ? { media: record.media } : {}), status: record.status, scheduledAt: iso(record.scheduledAt),
    timezone: TIMEZONE, publishedPostId: record.publishedPostId ?? null, attempts: record.attempts,
    lastErrorCode: record.lastErrorCode ?? null, lastErrorMessage: record.lastErrorMessage ?? null,
    publishingLeaseUntil: iso(record.publishingLeaseUntil), publishedAt: iso(record.publishedAt),
    createdAt: new Date(record.createdAt).toISOString(), updatedAt: new Date(record.updatedAt).toISOString()
  };
}

function localVietnameseTime(value: string): Date {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(Z|[+-]\d{2}:\d{2})?$/);
  if (!match) throw new AppError(400, "INVALID_REQUEST", "scheduledAt is invalid");
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, offset] = match;
  if (offset && offset !== "+07:00") throw new AppError(400, "INVALID_REQUEST", "scheduledAt must use Asia/Ho_Chi_Minh");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText ?? "0");
  const localTimestamp = Date.UTC(year, month - 1, day, hour, minute, second);
  const check = new Date(localTimestamp);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day
    || check.getUTCHours() !== hour || check.getUTCMinutes() !== minute || check.getUTCSeconds() !== second) {
    throw new AppError(400, "INVALID_REQUEST", "scheduledAt is invalid");
  }
  return new Date(localTimestamp - 7 * 60 * 60 * 1000);
}

function safePublishError(error: unknown): { code: string; message: string } {
  if (error instanceof AppError) return { code: error.code, message: error.message };
  return { code: "FACEBOOK_PUBLISH_FAILED", message: "Facebook could not publish the post" };
}

export class FacebookPostService {
  private readonly posts: PostModelLike;
  private readonly connections: ConnectionModelLike;
  private readonly publisher: Pick<FacebookPublisher, "publish">;
  private readonly media: Pick<FacebookPostMediaService, "upload" | "destroy">;
  private readonly decrypt: (value: string) => string;
  private readonly clock: () => Date;

  constructor(dependencies: FacebookPostServiceDependencies = {}) {
    this.posts = dependencies.postModel ?? FacebookPostModel as unknown as PostModelLike;
    this.connections = dependencies.connectionModel ?? FacebookPageConnectionModel;
    this.publisher = dependencies.publisher ?? facebookPublisher;
    this.media = dependencies.mediaService ?? facebookPostMediaService;
    this.decrypt = dependencies.decryptSecret ?? decryptSecret;
    this.clock = dependencies.now ?? (() => new Date());
  }

  private async connection(userId: string): Promise<ConnectionRecord> {
    const connection = await this.connections.findOne({ userId }).select("+encryptedPageAccessToken").lean();
    if (!connection || connection.status !== "connected") {
      throw new AppError(409, "FACEBOOK_PAGE_NOT_CONNECTED", "Facebook Page is not connected");
    }
    return connection;
  }

  private scheduledDate(value: string | undefined): Date {
    if (!value) throw new AppError(400, "INVALID_REQUEST", "scheduledAt is required");
    const date = localVietnameseTime(value);
    if (date.getTime() <= this.clock().getTime()) throw new AppError(400, "FACEBOOK_POST_SCHEDULE_IN_PAST", "Scheduled time must be in the future");
    return date;
  }

  private async publishPost(userId: string, record: PostRecord, connection: ConnectionRecord): Promise<FacebookPostResponse> {
    if (!connection.encryptedPageAccessToken) throw new AppError(409, "FACEBOOK_PAGE_NOT_CONNECTED", "Facebook Page is not connected");
    const published = await this.publisher.publish({
      pageId: connection.pageId,
      pageAccessToken: this.decrypt(connection.encryptedPageAccessToken!),
      message: record.message,
      ...(record.media ? { mediaUrl: record.media.secureUrl } : {})
    });
    const saved = await this.posts.findOneAndUpdate(
      { _id: record._id, userId, status: "publishing" },
      { $set: { status: "published", publishedPostId: published.publishedPostId, publishedAt: this.clock(), lastErrorCode: null, lastErrorMessage: null, publishingLeaseUntil: null } },
      { new: true, runValidators: true }
    ).lean();
    if (!saved) throw new AppError(409, "FACEBOOK_POST_STATE_CHANGED", "Facebook post state changed while publishing");
    return toResponse(saved);
  }

  private async failPost(userId: string, record: PostRecord, error: unknown): Promise<FacebookPostResponse> {
    const safe = safePublishError(error);
    const saved = await this.posts.findOneAndUpdate(
      { _id: record._id, userId, status: "publishing" },
      { $set: { status: "failed", lastErrorCode: safe.code, lastErrorMessage: safe.message, publishingLeaseUntil: null } },
      { new: true, runValidators: true }
    ).lean();
    if (!saved) throw new AppError(409, "FACEBOOK_POST_STATE_CHANGED", "Facebook post state changed while publishing");
    return toResponse(saved);
  }

  async createPost(userId: string, input: CreatePostInput): Promise<FacebookPostResponse> {
    const message = input.message.trim();
    if (!message) throw new AppError(400, "INVALID_REQUEST", "Post message is required");
    const scheduled = input.mode === "scheduled" ? this.scheduledDate(input.scheduledAt) : null;
    const connection = await this.connection(userId);
    let media = input.media;
    if (input.file) media = await this.media.upload(userId, input.file);
    const status = input.mode === "now" ? "publishing" : input.mode;
    let record: PostRecord;
    try {
      record = await this.posts.create({
        userId,
        connectionId: connection._id,
        pageId: connection.pageId,
        message,
        media: media ?? null,
        status,
        scheduledAt: scheduled,
        timezone: TIMEZONE,
        attempts: input.mode === "now" ? 1 : 0,
        publishingLeaseUntil: input.mode === "now" ? new Date(this.clock().getTime() + env.FACEBOOK_POST_LEASE_MS) : null
      });
    } catch (error) {
      if (media) await Promise.resolve(this.media.destroy(media)).catch(() => undefined);
      throw error;
    }
    if (input.mode !== "now") return toResponse(record);
    try { return await this.publishPost(userId, record, connection); } catch (error) { return this.failPost(userId, record, error); }
  }

  async updatePost(userId: string, postId: string, input: UpdatePostInput): Promise<FacebookPostResponse> {
    const current = await this.posts.findOne({ _id: postId, userId }).lean();
    if (!current) throw new AppError(404, "FACEBOOK_POST_NOT_FOUND", "Facebook post was not found");
    if (current.status !== "draft" && current.status !== "scheduled") throw new AppError(409, "FACEBOOK_POST_INVALID_STATE", "Facebook post cannot be updated in its current state");
    const update: Record<string, unknown> = {};
    if (input.message !== undefined) { if (!input.message.trim()) throw new AppError(400, "INVALID_REQUEST", "Post message is required"); update.message = input.message.trim(); }
    const hasSchedule = Object.prototype.hasOwnProperty.call(input, "scheduledAt");
    if (input.mode === "draft" && hasSchedule && input.scheduledAt !== null) {
      throw new AppError(400, "INVALID_REQUEST", "Draft posts cannot have a scheduled time");
    }
    if (input.mode === "scheduled" && hasSchedule && input.scheduledAt === null) {
      throw new AppError(400, "INVALID_REQUEST", "Scheduled posts require a scheduled time");
    }
    if (input.mode === "draft" || (hasSchedule && input.scheduledAt === null)) {
      update.status = "draft";
      update.scheduledAt = null;
    } else if (input.mode === "scheduled" || (hasSchedule && input.scheduledAt !== null)) {
      update.status = "scheduled";
      if (input.scheduledAt !== undefined && input.scheduledAt !== null) {
        update.scheduledAt = this.scheduledDate(input.scheduledAt);
      } else if (!current.scheduledAt || new Date(current.scheduledAt).getTime() <= this.clock().getTime()) {
        throw new AppError(400, "FACEBOOK_POST_SCHEDULE_IN_PAST", "Scheduled time must be in the future");
      } else {
        update.scheduledAt = current.scheduledAt;
      }
    }
    let newMedia: FacebookPostMedia | undefined;
    if (input.file) {
      newMedia = await this.media.upload(userId, input.file);
      update.media = newMedia;
    }
    let saved: PostRecord | null;
    try {
      saved = await this.posts.findOneAndUpdate({ _id: postId, userId, status: { $in: ["draft", "scheduled"] } }, { $set: update }, { new: true, runValidators: true }).lean();
    } catch (error) {
      if (newMedia) await Promise.resolve(this.media.destroy(newMedia)).catch(() => undefined);
      throw error;
    }
    if (!saved) {
      if (newMedia) await Promise.resolve(this.media.destroy(newMedia)).catch(() => undefined);
      throw new AppError(409, "FACEBOOK_POST_STATE_CHANGED", "Facebook post state changed while updating");
    }
    if (newMedia && current.media && current.media.publicId !== newMedia.publicId) await Promise.resolve(this.media.destroy(current.media)).catch(() => undefined);
    return toResponse(saved);
  }

  async listPosts(userId: string, filters: ListPostFilters): Promise<FacebookPostResponse[]> {
    const rows = await this.posts.find({ userId, ...(filters.status ? { status: filters.status } : {}) }).sort({ createdAt: -1, _id: -1 }).lean();
    return rows.map(toResponse);
  }

  async retryPost(userId: string, postId: string, mode: "now" | "scheduled"): Promise<FacebookPostResponse> {
    const current = await this.posts.findOne({ _id: postId, userId }).lean();
    if (!current) throw new AppError(404, "FACEBOOK_POST_NOT_FOUND", "Facebook post was not found");
    if (current.status !== "failed") throw new AppError(409, "FACEBOOK_POST_INVALID_STATE", "Only failed Facebook posts can be retried");
    if (mode === "scheduled" && (!current.scheduledAt || new Date(current.scheduledAt).getTime() <= this.clock().getTime())) throw new AppError(400, "FACEBOOK_POST_SCHEDULE_IN_PAST", "Scheduled time must be in the future");
    const connection = await this.connection(userId);
    const publishing = await this.posts.findOneAndUpdate(
      { _id: postId, userId, status: "failed" },
      {
        $set: {
          status: mode === "now" ? "publishing" : "scheduled",
          attempts: current.attempts + 1,
          lastErrorCode: null,
          lastErrorMessage: null,
          publishingLeaseUntil: mode === "now" ? new Date(this.clock().getTime() + env.FACEBOOK_POST_LEASE_MS) : null
        }
      },
      { new: true, runValidators: true }
    ).lean();
    if (!publishing) throw new AppError(409, "FACEBOOK_POST_STATE_CHANGED", "Facebook post state changed while retrying");
    if (mode === "scheduled") return toResponse(publishing);
    try { return await this.publishPost(userId, publishing, connection); } catch (error) { return this.failPost(userId, publishing, error); }
  }

  async cancelPost(userId: string, postId: string): Promise<void> {
    // Xóa có điều kiện để trạng thái hợp lệ và snapshot media cùng được chốt trong một thao tác nguyên tử.
    const deleted = await this.posts.findOneAndDelete({ _id: postId, userId, status: { $in: ["draft", "scheduled"] } }).lean();
    if (!deleted) {
      throw new AppError(409, "FACEBOOK_POST_STATE_CHANGED", "Facebook post state changed while cancelling");
    }
    if (deleted.media) {
      try {
        await this.media.destroy(deleted.media);
      } catch {
        // Bản ghi đã xóa là quyết định cuối; lỗi này được trả về để quy trình dọn media bên nhà cung cấp xử lý bù.
        throw new AppError(502, "FACEBOOK_POST_MEDIA_CLEANUP_FAILED", "Facebook post media could not be cleaned up");
      }
    }
  }
}

export const facebookPostService = new FacebookPostService();
