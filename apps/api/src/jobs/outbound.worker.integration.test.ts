import { describe, expect, it } from "vitest";

import { OutboundQueue } from "./outbound.queue.js";
import { OutboundWorker } from "./outbound.worker.js";

describe("outbound worker", () => {
  it("retries at 1s and 4s before marking a delivery failed", async () => {
    let now = new Date("2026-09-09T10:00:00.000Z");
    const queue = new OutboundQueue(() => now, () => "job-1");
    const states: string[] = [];
    const worker = new OutboundWorker({
      queue,
      now: () => now,
      deliver: async () => { throw new Error("provider unavailable"); },
      updateDelivery: async (_command, state) => { states.push(state.status); }
    });
    const id = await queue.enqueue({
      messageId: "message-1", conversationId: "conversation-1", platform: "telegram",
      channelId: "123", content: "Xin chào"
    });

    await expect(worker.runNext()).resolves.toBe(true);
    expect(queue.get(id)).toMatchObject({ attempts: 1, status: "queued", runAt: now.getTime() + 1_000 });
    now = new Date(now.getTime() + 999);
    await expect(worker.runNext()).resolves.toBe(false);
    now = new Date(now.getTime() + 1);
    await worker.runNext();
    expect(queue.get(id)).toMatchObject({ attempts: 2, status: "queued", runAt: now.getTime() + 4_000 });
    now = new Date(now.getTime() + 4_000);
    await worker.runNext();

    expect(queue.get(id)).toMatchObject({ attempts: 3, status: "failed", lastError: "provider unavailable" });
    expect(states).toEqual(["failed"]);
    await expect(worker.runNext()).resolves.toBe(false);
  });

  it("marks a successful delivery sent without retrying", async () => {
    const now = new Date("2026-09-09T10:00:00.000Z");
    const queue = new OutboundQueue(() => now, () => "job-2");
    const states: Array<{ status: string; externalMessageId?: string }> = [];
    const worker = new OutboundWorker({
      queue,
      now: () => now,
      deliver: async () => ({ externalMessageId: "telegram-42" }),
      updateDelivery: async (_command, state) => { states.push(state); }
    });
    const id = await queue.enqueue({
      messageId: "message-2", conversationId: "conversation-2", platform: "telegram",
      channelId: "456", content: "Đã nhận"
    });

    await worker.runNext();

    expect(queue.get(id)).toMatchObject({ attempts: 1, status: "completed" });
    expect(states).toEqual([{ status: "sent", externalMessageId: "telegram-42" }]);
  });
});
