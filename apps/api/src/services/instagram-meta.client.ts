import { AppError } from "../common/errors.js";

type MetaFetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface InstagramProfile {
  instagramUserId: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

export class InstagramMetaClient {
  constructor(
    private readonly fetchMeta: MetaFetch = fetch,
    private readonly version = process.env.INSTAGRAM_GRAPH_API_VERSION ?? "v26.0",
    private readonly timeoutMs = 10_000
  ) {}

  // Giới hạn thời gian và dung lượng phản hồi Meta; lỗi trả về không chứa body hay credential.
  private async json(url: URL, init: RequestInit, code: string): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const request = (async () => {
        const response = await this.fetchMeta(url.toString(), { ...init, signal: controller.signal });
        const length = Number(response.headers.get("content-length") ?? 0);
        if (length > 65_536) throw new Error("Meta response too large");
        const reader = response.body?.getReader();
        if (!reader) throw new Error("Meta response has no body");
        const chunks: Uint8Array[] = [];
        let bytes = 0;
        for (;;) {
          const next = await reader.read();
          if (next.done) break;
          bytes += next.value.byteLength;
          if (bytes > 65_536) { await reader.cancel(); throw new Error("Meta response too large"); }
          chunks.push(next.value);
        }
        const body = new TextDecoder().decode(Buffer.concat(chunks));
        const parsed: unknown = JSON.parse(body);
        if (!response.ok || !parsed || typeof parsed !== "object" || "error" in parsed) throw new Error("Meta rejected request");
        return parsed as Record<string, unknown>;
      })();
      return await Promise.race([
        request,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => { controller.abort(); reject(new Error("Meta timeout")); }, this.timeoutMs);
          timer.unref?.();
        })
      ]);
    } catch {
      throw new AppError(502, code, "Instagram request failed");
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async exchangeCode(code: string, appId: string, appSecret: string, redirectUri: string): Promise<{ accessToken: string; userId: string }> {
    const form = new URLSearchParams({ client_id: appId, client_secret: appSecret, grant_type: "authorization_code", redirect_uri: redirectUri, code });
    const body = await this.json(new URL("https://api.instagram.com/oauth/access_token"), {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form.toString()
    }, "INSTAGRAM_OAUTH_CODE_EXCHANGE_FAILED");
    const userId = typeof body.user_id === "number" ? String(body.user_id) : body.user_id;
    if (typeof body.access_token !== "string" || !body.access_token || typeof userId !== "string" || !userId) {
      throw new AppError(502, "INSTAGRAM_OAUTH_CODE_EXCHANGE_FAILED", "Instagram request failed");
    }
    return { accessToken: body.access_token, userId };
  }

  async exchangeLongToken(accessToken: string, appSecret: string): Promise<{ accessToken: string; expiresAt: Date | null }> {
    const url = new URL("https://graph.instagram.com/access_token");
    url.search = new URLSearchParams({ grant_type: "ig_exchange_token", client_secret: appSecret, access_token: accessToken }).toString();
    return this.tokenResult(await this.json(url, { method: "GET" }, "INSTAGRAM_OAUTH_LONG_TOKEN_FAILED"), "INSTAGRAM_OAUTH_LONG_TOKEN_FAILED");
  }

  async refreshLongToken(accessToken: string): Promise<{ accessToken: string; expiresAt: Date | null }> {
    const url = new URL("https://graph.instagram.com/refresh_access_token");
    url.search = new URLSearchParams({ grant_type: "ig_refresh_token", access_token: accessToken }).toString();
    return this.tokenResult(await this.json(url, { method: "GET" }, "INSTAGRAM_TOKEN_REFRESH_FAILED"), "INSTAGRAM_TOKEN_REFRESH_FAILED");
  }

  private tokenResult(body: Record<string, unknown>, code: string): { accessToken: string; expiresAt: Date | null } {
    if (typeof body.access_token !== "string" || !body.access_token) throw new AppError(502, code, "Instagram request failed");
    const expiresAt = typeof body.expires_in === "number" && body.expires_in > 0
      ? new Date(Date.now() + body.expires_in * 1000) : null;
    return { accessToken: body.access_token, expiresAt };
  }

  async profile(accessToken: string, canonicalUserId: string): Promise<InstagramProfile> {
    const url = new URL(`https://graph.instagram.com/${this.version}/me`);
    url.searchParams.set("fields", "user_id,username,name,profile_picture_url");
    const body = await this.json(url, { method: "GET", headers: { authorization: `Bearer ${accessToken}` } }, "INSTAGRAM_PROFILE_FAILED");
    const profileUserId = typeof body.user_id === "number" ? String(body.user_id) : body.user_id;
    if (typeof profileUserId !== "string" || profileUserId !== canonicalUserId) throw new AppError(502, "INSTAGRAM_PROFILE_ID_MISMATCH", "Instagram account identity did not match");
    return {
      instagramUserId: canonicalUserId,
      username: typeof body.username === "string" ? body.username : null,
      displayName: typeof body.name === "string" ? body.name : null,
      avatarUrl: typeof body.profile_picture_url === "string" ? body.profile_picture_url : null
    };
  }

  async subscribe(userId: string, accessToken: string): Promise<void> {
    const url = new URL(`https://graph.instagram.com/${this.version}/${encodeURIComponent(userId)}/subscribed_apps`);
    url.searchParams.set("subscribed_fields", "messages");
    const body = await this.json(url, { method: "POST", headers: { authorization: `Bearer ${accessToken}` } }, "INSTAGRAM_SUBSCRIBE_FAILED");
    if (body.success !== true) throw new AppError(502, "INSTAGRAM_SUBSCRIBE_FAILED", "Instagram request failed");
  }

  async unsubscribe(userId: string, accessToken: string): Promise<void> {
    const url = new URL(`https://graph.instagram.com/${this.version}/${encodeURIComponent(userId)}/subscribed_apps`);
    await this.json(url, { method: "DELETE", headers: { authorization: `Bearer ${accessToken}` } }, "INSTAGRAM_UNSUBSCRIBE_FAILED");
  }
}
