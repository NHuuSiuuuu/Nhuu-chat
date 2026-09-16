export interface ChannelBotAdapter {
  sendText(input: { channelId: string; content: string }): Promise<{ externalMessageId?: string }>;
}

export interface NormalizedCustomerMessage {
  ownerId: string;
  conversationId: string;
  customerMessageId: string;
  externalMessageId?: string;
  platform: string;
  channelId: string;
  conversationType?: "private" | "group";
  senderType: "customer" | "agent" | "bot";
  content: string;
  type: "text" | "image" | "video" | "audio" | "file" | "template";
}

export type BotProcessResult = { status: "sent" | "handed_off" | "skipped" | "failed" };

export type ResolveBotAdapter = (input: {
  ownerId: string;
  platform: string;
  channelId: string;
}) => ChannelBotAdapter | undefined | Promise<ChannelBotAdapter | undefined>;

// Giới hạn thời gian chờ; kết quả đến muộn không được kích hoạt lần gửi thứ hai.
export async function withBotTimeout<T>(
  work: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const controller = new AbortController();
  try {
    return await Promise.race([
      Promise.resolve().then(() => work(controller.signal)),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("BOT_TIMEOUT"));
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
