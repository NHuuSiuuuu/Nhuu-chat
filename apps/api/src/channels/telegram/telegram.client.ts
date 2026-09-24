export interface ExternalDelivery {
  externalMessageId: string;
  status: "sent";
}

interface TelegramClientOptions {
  fetch?: typeof fetch;
  timeoutMs?: number;
}

interface TelegramApiResponse {
  ok?: unknown;
  result?: unknown;
}

const DEFAULT_TIMEOUT_MS = 5_000;

export class TelegramClient {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(
    private readonly botToken: string,
    options: TelegramClientOptions = {}
  ) {
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async sendText(chatId: string, text: string): Promise<ExternalDelivery> {
    const result = await this.request("sendMessage", { chat_id: chatId, text });
    if (!isRecord(result) || typeof result.message_id !== "number") {
      throw new Error("Telegram API returned an invalid response");
    }

    return { externalMessageId: String(result.message_id), status: "sent" };
  }

  async setWebhook(url: string, secretToken?: string): Promise<void> {
    const result = await this.request("setWebhook", {
      url,
      ...(secretToken ? { secret_token: secretToken } : {})
    });
    if (result !== true) throw new Error("Telegram API returned an invalid response");
  }

  private async request(method: string, body: Record<string, string>): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(
        `https://api.telegram.org/bot${this.botToken}/${method}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal
        }
      );
      const payload = (await response.json().catch(() => null)) as TelegramApiResponse | null;

      if (!response.ok || payload?.ok !== true) {
        throw new Error(`Telegram API request failed with status ${response.status}`);
      }

      return payload.result;
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error("Telegram API request timed out");
      }
      if (error instanceof Error && error.message.startsWith("Telegram API")) throw error;

      throw new Error("Telegram API request failed");
    } finally {
      clearTimeout(timeout);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
