import { ConversationModel } from "../models/conversation.model.js";

// Nhân viên tiếp quản sẽ kéo dài pause, không rút ngắn thời hạn bàn giao đang có.
export async function pauseBot(conversationId: string, now: Date, minutes = 30): Promise<Date> {
  const until = new Date(now.getTime() + minutes * 60_000);
  await ConversationModel.findByIdAndUpdate(conversationId, { $max: { botPausedUntil: until } });
  return until;
}

export function isBotPaused(botPausedUntil: Date | null, now: Date): boolean {
  return Boolean(botPausedUntil && botPausedUntil.getTime() > now.getTime());
}
