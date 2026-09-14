import { retryDelay } from "./retry-policy.js";
import type { OutboundCommand, OutboundQueue } from "./outbound.queue.js";
export class OutboundWorker {
  constructor(
    private readonly options: {
      queue: OutboundQueue;
      now: () => Date;
      maxAttempts?: number;
      deliver: (command: OutboundCommand) => Promise<{ externalMessageId?: string }>;
      updateDelivery: (
        command: OutboundCommand,
        state: { status: "sent" | "failed"; externalMessageId?: string; error?: string }
      ) => Promise<void>;
    }
  ) {}

  // Chỉ retry lỗi connector trong giới hạn; lỗi lưu trạng thái sau khi gửi không được gửi lại.
  async runNext(): Promise<boolean> {
    const job = this.options.queue.nextDue();
    if (!job) return false;
    let result: { externalMessageId?: string };
    try {
      result = await this.options.deliver(job);
    } catch (error) {
      const attempts = job.attempts + 1;
      const delay = attempts >= (this.options.maxAttempts ?? 3) ? null : retryDelay(attempts);
      this.options.queue.update(
        job.id,
        delay === null
          ? {
              attempts,
              status: "failed",
              lastError: error instanceof Error ? error.message : "delivery failed"
            }
          : { attempts, runAt: this.options.now().getTime() + delay }
      );
      if (delay === null)
        await this.options.updateDelivery(job, {
          status: "failed",
          error: error instanceof Error ? error.message : "delivery failed"
        });
      return true;
    }
    this.options.queue.update(job.id, { attempts: job.attempts + 1, status: "completed" });
    await this.options.updateDelivery(job, {
      status: "sent",
      externalMessageId: result.externalMessageId
    });
    return true;
  }
}
