import { env } from "@nhuu-chat/config";

import { decryptSecret } from "../common/crypto.js";
import { AppError } from "../common/errors.js";
import { FacebookPageConnectionModel } from "../models/facebook-page-connection.model.js";
import { FacebookPostModel } from "../models/facebook-post.model.js";
import { FacebookPublisher, facebookPublisher } from "../services/facebook-publisher.service.js";

type PostRecord = {
  _id: unknown;
  userId: unknown;
  connectionId: unknown;
  pageId: string;
  message: string;
  media?: { secureUrl: string } | null;
  status: "scheduled" | "publishing" | "published" | "failed";
  attempts: number;
  publishedPostId?: string | null;
  publishingLeaseUntil?: Date | null;
};

type ConnectionRecord = {
  pageId: string;
  status: "connected" | "invalid";
  encryptedPageAccessToken?: string;
};

type Query<T> = { lean(): Promise<T> };

interface PostModelLike {
  findOneAndUpdate(
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
    options?: Record<string, unknown>
  ): Query<PostRecord | null>;
}

interface ConnectionModelLike {
  findOne(filter: Record<string, unknown>): { select(fields: string): Query<ConnectionRecord | null> };
}

export type FacebookPostSchedulerDependencies = {
  postModel?: PostModelLike;
  connectionModel?: ConnectionModelLike;
  publisher?: Pick<FacebookPublisher, "publish">;
  decryptSecret?: (value: string) => string;
  now?: () => Date;
  intervalMs?: number;
  leaseMs?: number;
  setInterval?: typeof setInterval;
  clearInterval?: typeof clearInterval;
};

function safePublishError(error: unknown): { code: string; message: string } {
  if (error instanceof AppError) return { code: error.code, message: error.message };
  return { code: "FACEBOOK_PUBLISH_FAILED", message: "Facebook could not publish the post" };
}

function persistenceError(): AppError {
  return new AppError(500, "FACEBOOK_POST_PERSISTENCE_FAILED", "Facebook post state could not be persisted");
}

export class FacebookPostScheduler {
  private readonly posts: PostModelLike;
  private readonly connections: ConnectionModelLike;
  private readonly publisher: Pick<FacebookPublisher, "publish">;
  private readonly decrypt: (value: string) => string;
  private readonly clock: () => Date;
  private readonly intervalMs: number;
  private readonly leaseMs: number;
  private readonly scheduleInterval: typeof setInterval;
  private readonly cancelInterval: typeof clearInterval;
  private timer: ReturnType<typeof setInterval> | undefined;
  private running = false;

  constructor(dependencies: FacebookPostSchedulerDependencies = {}) {
    this.posts = dependencies.postModel ?? FacebookPostModel as unknown as PostModelLike;
    this.connections = dependencies.connectionModel ?? FacebookPageConnectionModel;
    this.publisher = dependencies.publisher ?? facebookPublisher;
    this.decrypt = dependencies.decryptSecret ?? decryptSecret;
    this.clock = dependencies.now ?? (() => new Date());
    this.intervalMs = dependencies.intervalMs ?? env.FACEBOOK_POST_SCHEDULER_INTERVAL_MS;
    this.leaseMs = dependencies.leaseMs ?? env.FACEBOOK_POST_LEASE_MS;
    this.scheduleInterval = dependencies.setInterval ?? setInterval;
    this.cancelInterval = dependencies.clearInterval ?? clearInterval;
  }

  start(): void {
    if (this.timer) return;
    this.timer = this.scheduleInterval(() => {
      void this.runOnce().catch((error) => console.error("Facebook post scheduler run failed", error));
    }, this.intervalMs);
    this.timer.unref?.();
    void this.runOnce().catch((error) => console.error("Facebook post scheduler startup pass failed", error));
  }

  stop(): void {
    if (!this.timer) return;
    this.cancelInterval(this.timer);
    this.timer = undefined;
  }

  private async persistTerminal(
    claimed: PostRecord,
    update: Record<string, unknown>
  ): Promise<void> {
    let saved: PostRecord | null;
    try {
      saved = await this.posts.findOneAndUpdate(
        { _id: claimed._id, status: "publishing", publishingLeaseUntil: claimed.publishingLeaseUntil },
        update,
        { new: true, runValidators: true }
      ).lean();
    } catch {
      throw persistenceError();
    }
    if (!saved) throw new AppError(409, "FACEBOOK_POST_STATE_CHANGED", "Facebook post state changed while publishing");
  }

  async runOnce(): Promise<boolean> {
    if (this.running) return false;
    this.running = true;
    try {
      const now = this.clock();
      const leaseUntil = new Date(now.getTime() + this.leaseMs);
      const claimed = await this.posts.findOneAndUpdate(
        { status: "scheduled", scheduledAt: { $lte: now } },
        { $set: { status: "publishing", publishingLeaseUntil: leaseUntil }, $inc: { attempts: 1 } },
        { new: true, runValidators: true }
      ).lean();
      if (!claimed) {
        let recovered: PostRecord | null;
        try {
          recovered = await this.posts.findOneAndUpdate(
            { status: "publishing", publishingLeaseUntil: { $lte: now } },
            {
              $set: {
                status: "failed",
                lastErrorCode: "FACEBOOK_PUBLISH_LEASE_EXPIRED",
                lastErrorMessage: "Facebook publish lease expired; retry requires manual confirmation",
                publishingLeaseUntil: null
              }
            },
            { new: true, runValidators: true }
          ).lean();
        } catch {
          throw persistenceError();
        }
        return Boolean(recovered);
      }

      let published: { publishedPostId: string };
      try {
        const connection = await this.connections.findOne({ _id: claimed.connectionId, userId: claimed.userId })
          .select("+encryptedPageAccessToken").lean();
        if (!connection || connection.status !== "connected" || !connection.encryptedPageAccessToken) {
          throw new AppError(409, "FACEBOOK_PAGE_NOT_CONNECTED", "Facebook Page is not connected");
        }
        if (connection.pageId !== claimed.pageId) {
          throw new AppError(409, "FACEBOOK_PAGE_ID_MISMATCH", "Facebook connection Page does not match the post Page");
        }
        published = await this.publisher.publish({
          pageId: connection.pageId,
          pageAccessToken: this.decrypt(connection.encryptedPageAccessToken),
          message: claimed.message,
          ...(claimed.media ? { mediaUrl: claimed.media.secureUrl } : {})
        });
      } catch (error) {
        const safe = safePublishError(error);
        await this.persistTerminal(claimed, {
          $set: {
            status: "failed",
            lastErrorCode: safe.code,
            lastErrorMessage: safe.message,
            publishingLeaseUntil: null
          }
        });
        return true;
      }
      await this.persistTerminal(claimed, {
        $set: {
          status: "published",
          publishedPostId: published.publishedPostId,
          publishedAt: this.clock(),
          lastErrorCode: null,
          lastErrorMessage: null,
          publishingLeaseUntil: null
        }
      });
      return true;
    } finally {
      this.running = false;
    }
  }
}

export const facebookPostScheduler = new FacebookPostScheduler();
