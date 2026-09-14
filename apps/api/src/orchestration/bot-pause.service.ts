import { ConversationModel } from "../models/conversation.model.js";
import { randomUUID } from "node:crypto";

// Khóa MongoDB dùng chung giữa các process; không tự hết hạn khi lượt gửi có thể còn đang chạy.
export async function withConversationSendLock<T>(conversationId: string, work: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  const leaseId = randomUUID();
  const deadline = Date.now() + 15_000;
  let acquired = false;
  try {
    while (!acquired) {
      signal?.throwIfAborted();
      const conversation = await ConversationModel.findOneAndUpdate(
        { _id: conversationId, sendLeaseId: null },
        { $set: { sendLeaseId: leaseId, sendLeaseAt: new Date() } },
        { returnDocument: "after" }
      ).lean();
      acquired = Boolean(conversation);
      if (!acquired) {
        if (Date.now() >= deadline) throw new Error("CONVERSATION_SEND_BUSY");
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    }
    signal?.throwIfAborted();
    return await work();
  } finally {
    if (acquired) await ConversationModel.updateOne(
      { _id: conversationId, sendLeaseId: leaseId },
      { $set: { sendLeaseId: null, sendLeaseAt: null } }
    );
  }
}

// Nhân viên tiếp quản sẽ kéo dài pause, không rút ngắn thời hạn bàn giao đang có.
export async function pauseBot(conversationId: string, now: Date, minutes = 30): Promise<Date> {
  const until = new Date(now.getTime() + minutes * 60_000);
  await withConversationSendLock(conversationId, async () => {
    await ConversationModel.findByIdAndUpdate(conversationId, { $max: { botPausedUntil: until } });
  });
  return until;
}

export function isBotPaused(botPausedUntil: Date | null, now: Date): boolean {
  return Boolean(botPausedUntil && botPausedUntil.getTime() > now.getTime());
}
