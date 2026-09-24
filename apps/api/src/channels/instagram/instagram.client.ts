import { AppError } from "../../common/errors.js";

type MetaFetch = (input: string, init?: RequestInit) => Promise<Response>;

type SendTextInput = {
  instagramUserId: string;
  accessToken: string;
  recipientId: string;
  text: string;
};

export class InstagramClient {
  constructor(
    private readonly fetchMeta: MetaFetch = fetch,
    private readonly version = process.env.INSTAGRAM_GRAPH_API_VERSION ?? "v26.0",
    private readonly timeoutMs = 10_000,
    private readonly retryDelayMs = 150
  ) {}

  async sendText(input: SendTextInput): Promise<{ externalMessageId: string }> {
    const url = `https://graph.instagram.com/${this.version}/${encodeURIComponent(input.instagramUserId)}/messages`;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let response: Response;
      let body: Record<string, unknown>;
      try {
        ({ response, body } = await this.fetchOnce(url, input));
      } catch {
        // A timed out POST may have been accepted by Meta, so never replay an ambiguous result.
        throw new AppError(502, "INSTAGRAM_DELIVERY_UNCERTAIN", "Instagram delivery could not be confirmed");
      }
      if (response.ok && typeof body.message_id === "string" && body.message_id) {
        return { externalMessageId: body.message_id };
      }
      const error = body.error && typeof body.error === "object" ? body.error as Record<string, unknown> : {};
      const code = typeof error.code === "number" ? error.code : undefined;
      const subcode = typeof error.error_subcode === "number" ? error.error_subcode : undefined;
      if (subcode === 2018278) throw new AppError(422, "INSTAGRAM_POLICY_WINDOW_CLOSED", "The Instagram reply window is closed");
      if (response.status === 401 || code === 190) throw new AppError(409, "INSTAGRAM_TOKEN_UNAVAILABLE", "Instagram access token is invalid or expired");
      if (response.status === 403 || code === 10 || code === 200) throw new AppError(403, "INSTAGRAM_PERMISSION_DENIED", "Instagram messaging permission is unavailable");
      if (response.status === 429 && attempt === 0) {
        if (this.retryDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs));
        continue;
      }
      if (response.status >= 400 && response.status < 500) {
        throw new AppError(422, "INSTAGRAM_REQUEST_REJECTED", "Instagram rejected the message");
      }
      throw new AppError(502, "INSTAGRAM_DELIVERY_FAILED", "Instagram message delivery failed");
    }
    throw new AppError(502, "INSTAGRAM_DELIVERY_FAILED", "Instagram message delivery failed");
  }

  private async fetchOnce(url: string, input: SendTextInput): Promise<{ response: Response; body: Record<string, unknown> }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    timer.unref?.();
    try {
      const response = await this.fetchMeta(url, {
        method: "POST",
        headers: { authorization: `Bearer ${input.accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({ recipient: { id: input.recipientId }, message: { text: input.text } }),
        signal: controller.signal
      });
      return { response, body: await readJson(response) };
    } finally {
      clearTimeout(timer);
    }
  }
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const length = Number(response.headers.get("content-length") ?? 0);
    if (length > 65_536) return {};
    const reader = response.body?.getReader();
    if (!reader) return {};
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > 65_536) {
        await reader.cancel();
        return {};
      }
      chunks.push(next.value);
    }
    const text = new TextDecoder().decode(Buffer.concat(chunks));
    const value: unknown = JSON.parse(text);
    return value && typeof value === "object" ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export const instagramClient = new InstagramClient();
