import { env } from "@nhuu-chat/config";

import { AppError } from "../../common/errors.js";

type GraphFetch = (input: string, init?: RequestInit) => Promise<Response>;

const GRAPH_ORIGIN = "https://graph.facebook.com";
const REQUEST_TIMEOUT_MS = 10_000;
const TIMEOUT = Symbol("graph request timeout");

export interface FacebookMessengerClientDependencies {
  fetchGraph?: GraphFetch;
  graphApiVersion?: string;
  timeoutMs?: number;
}

export interface FacebookMessengerPageInput {
  pageId: string;
  pageAccessToken: string;
}

type MessengerOperation = "send" | "subscribe" | "unsubscribe";

function operationFailure(operation: MessengerOperation): AppError {
  return new AppError(502, `FACEBOOK_MESSENGER_${operation.toUpperCase()}_FAILED`, "Facebook Messenger request failed");
}

function graphError(body: unknown): { code?: number; subcode?: number } {
  if (!body || typeof body !== "object") return {};
  const error = (body as { error?: unknown }).error;
  if (!error || typeof error !== "object") return {};
  const value = error as { code?: unknown; error_subcode?: unknown };
  return {
    ...(typeof value.code === "number" ? { code: value.code } : {}),
    ...(typeof value.error_subcode === "number" ? { subcode: value.error_subcode } : {})
  };
}

// Chỉ ánh xạ mã số Meta sang lỗi ổn định; không đưa response hoặc token vào exception.
function mapGraphFailure(status: number, body: unknown, operation: MessengerOperation): AppError {
  const { code, subcode } = graphError(body);
  if (code === 190 || status === 401) {
    return new AppError(401, "FACEBOOK_MESSENGER_TOKEN_INVALID", "Facebook Page access token is invalid");
  }
  if (operation === "send" && code === 10 && subcode === 2018278) {
    return new AppError(422, "FACEBOOK_MESSENGER_POLICY_WINDOW_CLOSED", "The Messenger reply window is closed");
  }
  if ([4, 17, 32, 613].includes(code ?? -1) || status === 429) {
    return new AppError(429, "FACEBOOK_MESSENGER_RATE_LIMITED", "Facebook Messenger is rate limited");
  }
  if ([10, 100, 200].includes(code ?? -1) || status === 403) {
    return new AppError(403, "FACEBOOK_MESSENGER_PERMISSION_DENIED", "Facebook Messenger permission was denied");
  }
  return operationFailure(operation);
}

function isTimeout(error: unknown): boolean {
  if (error === TIMEOUT) return true;
  if (!error || typeof error !== "object") return false;
  const value = error as { name?: unknown; code?: unknown };
  return value.name === "AbortError" || value.name === "TimeoutError" || value.code === "ETIMEDOUT";
}

export class FacebookMessengerClient {
  private readonly fetchGraph: GraphFetch;
  private readonly graphApiVersion: string;
  private readonly timeoutMs: number;

  constructor(dependencies: FacebookMessengerClientDependencies = {}) {
    this.fetchGraph = dependencies.fetchGraph ?? fetch;
    this.graphApiVersion = dependencies.graphApiVersion ?? env.META_GRAPH_API_VERSION;
    this.timeoutMs = dependencies.timeoutMs ?? REQUEST_TIMEOUT_MS;
  }

  // Bọc cả tải response body trong deadline và hủy request khi hết thời gian.
  private async request(input: FacebookMessengerPageInput, edge: string, operation: MessengerOperation, init: RequestInit): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let response: Response;
    let body: unknown;
    try {
      ({ response, body } = await Promise.race([
        (async () => {
          const graphResponse = await this.fetchGraph(
            `${GRAPH_ORIGIN}/${this.graphApiVersion}/${encodeURIComponent(input.pageId)}/${edge}`,
            {
              ...init,
              headers: { authorization: `Bearer ${input.pageAccessToken}`, ...init.headers },
              signal: controller.signal
            }
          );
          return { response: graphResponse, body: await graphResponse.json() as unknown };
        })(),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => {
            controller.abort();
            reject(TIMEOUT);
          }, this.timeoutMs);
        })
      ]));
    } catch (error) {
      if (isTimeout(error)) {
        throw new AppError(504, "FACEBOOK_MESSENGER_TIMEOUT", "Facebook Messenger request timed out");
      }
      throw operationFailure(operation);
    } finally {
      if (timeout) clearTimeout(timeout);
    }

    if (!response.ok || graphError(body).code !== undefined) throw mapGraphFailure(response.status, body, operation);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw operationFailure(operation);
    return body as Record<string, unknown>;
  }

  async sendText(input: FacebookMessengerPageInput & { psid: string; text: string }): Promise<{ externalMessageId: string }> {
    const body = await this.request(input, "messages", "send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ recipient: { id: input.psid }, messaging_type: "RESPONSE", message: { text: input.text } })
    });
    if (typeof body.message_id !== "string" || !body.message_id) throw operationFailure("send");
    return { externalMessageId: body.message_id };
  }

  async subscribePage(input: FacebookMessengerPageInput): Promise<void> {
    const body = await this.request(input, "subscribed_apps", "subscribe", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ subscribed_fields: "messages,message_echoes" })
    });
    if (body.success !== true) throw operationFailure("subscribe");
  }

  async unsubscribePage(input: FacebookMessengerPageInput): Promise<void> {
    const body = await this.request(input, "subscribed_apps", "unsubscribe", { method: "DELETE" });
    if (body.success !== true) throw operationFailure("unsubscribe");
  }
}

export const facebookMessengerClient = new FacebookMessengerClient();
