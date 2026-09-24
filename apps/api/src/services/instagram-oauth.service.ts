import { randomUUID } from "node:crypto";

import type { InstagramConnectionResponse } from "@nhuu-chat/contracts";

import { AppError } from "../common/errors.js";
import { instagramAccountService } from "./instagram-account.service.js";
import { InstagramMetaClient } from "./instagram-meta.client.js";
import { instagramOAuthStore } from "./instagram-oauth.store.js";

const STATE_TTL_SECONDS = 600;

export interface InstagramOAuthStateStore {
  save(state: string, value: { userId: string }, ttlSeconds: number): Promise<void>;
  consume(state: string): Promise<{ userId: string } | undefined>;
}

interface Dependencies {
  appId?: string;
  appSecret?: string;
  redirectUri?: string;
  graphApiVersion?: string;
  stateStore: InstagramOAuthStateStore;
  fetchMeta?: (input: string, init?: RequestInit) => Promise<Response>;
  randomToken?: () => string;
  connect?: (ownerUserId: string, input: { instagramUserId: string; accessToken: string; username: string | null; displayName: string | null; avatarUrl: string | null; expiresAt: Date | null }) => Promise<InstagramConnectionResponse>;
}

function configured(value: string | undefined): string {
  if (!value?.trim()) throw new AppError(503, "INSTAGRAM_OAUTH_NOT_CONFIGURED", "Instagram OAuth is not configured");
  return value;
}

export class InstagramOAuthService {
  private readonly meta: InstagramMetaClient;
  private readonly randomToken: () => string;
  private readonly connect: NonNullable<Dependencies["connect"]>;

  constructor(private readonly options: Dependencies) {
    this.meta = new InstagramMetaClient(options.fetchMeta, options.graphApiVersion);
    this.randomToken = options.randomToken ?? randomUUID;
    this.connect = options.connect ?? ((owner, input) => instagramAccountService.connect(owner, input));
  }

  async start(userId: string): Promise<{ authorizationUrl: string }> {
    const appId = configured(this.options.appId ?? process.env.INSTAGRAM_APP_ID);
    const redirectUri = configured(this.options.redirectUri ?? process.env.INSTAGRAM_OAUTH_REDIRECT_URI);
    const state = this.randomToken();
    await this.options.stateStore.save(state, { userId }, STATE_TTL_SECONDS);
    const url = new URL("https://www.instagram.com/oauth/authorize");
    url.search = new URLSearchParams({ client_id: appId, redirect_uri: redirectUri, response_type: "code", scope: "instagram_business_basic,instagram_business_manage_messages", state }).toString();
    return { authorizationUrl: url.toString() };
  }

  async cancel(userId: string, state: string): Promise<void> {
    if (!state) throw new AppError(400, "INSTAGRAM_OAUTH_STATE_INVALID", "Instagram OAuth state is invalid or expired");
    const saved = await this.options.stateStore.consume(state);
    if (!saved || saved.userId !== userId) throw new AppError(400, "INSTAGRAM_OAUTH_STATE_INVALID", "Instagram OAuth state is invalid or expired");
  }

  // Tiêu thụ state trước mọi lệnh Meta và chỉ hoàn tất khi connection đã subscribe thành công.
  async finish(userId: string, state: string, code: string): Promise<InstagramConnectionResponse> {
    if (!state || !code) throw new AppError(400, "INSTAGRAM_OAUTH_CALLBACK_INVALID", "Instagram OAuth callback is invalid");
    const saved = await this.options.stateStore.consume(state);
    if (!saved || saved.userId !== userId) throw new AppError(400, "INSTAGRAM_OAUTH_STATE_INVALID", "Instagram OAuth state is invalid or expired");
    const appId = configured(this.options.appId ?? process.env.INSTAGRAM_APP_ID);
    const appSecret = configured(this.options.appSecret ?? process.env.INSTAGRAM_APP_SECRET);
    const redirectUri = configured(this.options.redirectUri ?? process.env.INSTAGRAM_OAUTH_REDIRECT_URI);
    const short = await this.meta.exchangeCode(code, appId, appSecret, redirectUri);
    const long = await this.meta.exchangeLongToken(short.accessToken, appSecret);
    const profile = await this.meta.profile(long.accessToken, short.userId);
    return this.connect(userId, { ...profile, accessToken: long.accessToken, expiresAt: long.expiresAt });
  }
}

export const instagramOAuthService = new InstagramOAuthService({ stateStore: instagramOAuthStore });
