import { randomUUID } from "node:crypto";

import { AppError } from "../common/errors.js";
import { facebookOAuthStore } from "./facebook-oauth.store.js";

const OAUTH_STATE_TTL_SECONDS = 600;

export interface FacebookOAuthStore {
  save(token: string, value: FacebookOAuthStoredValue, ttlSeconds: number): Promise<void>;
  consume(token: string): Promise<FacebookOAuthStoredValue | undefined>;
}

export interface FacebookOAuthPage {
  id: string;
  name: string;
  canPublish: boolean;
}

interface FacebookOAuthPageSecret extends FacebookOAuthPage {
  accessToken: string;
}

export type FacebookOAuthStoredValue =
  | { kind: "oauth"; userId: string }
  | { kind: "selection"; userId: string; pages: FacebookOAuthPageSecret[] };

type GraphFetch = (input: string, init?: RequestInit) => Promise<Response>;

interface FacebookOAuthServiceDependencies {
  appId?: string;
  appSecret?: string;
  redirectUri?: string;
  graphApiVersion?: string;
  stateStore: FacebookOAuthStore;
  fetchGraph?: GraphFetch;
  randomToken?: () => string;
}

interface GraphPage {
  id?: unknown;
  name?: unknown;
  access_token?: unknown;
  tasks?: unknown;
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) throw new AppError(503, "FACEBOOK_OAUTH_NOT_CONFIGURED", `${name} is not configured`);
  return value;
}

async function graphJson(fetchGraph: GraphFetch, url: URL, failureCode: string): Promise<Record<string, unknown>> {
  let response: Response;
  let body: unknown;
  try {
    response = await fetchGraph(url.toString(), { method: "GET" });
    body = await response.json();
  } catch {
    throw new AppError(502, failureCode, "Facebook OAuth request failed");
  }
  if (!response.ok || !body || typeof body !== "object" || "error" in body) {
    throw new AppError(502, failureCode, "Facebook OAuth request failed");
  }
  return body as Record<string, unknown>;
}

export class FacebookOAuthService {
  private readonly appId: string | undefined;
  private readonly appSecret: string | undefined;
  private readonly redirectUri: string | undefined;
  private readonly graphApiVersion: string;
  private readonly stateStore: FacebookOAuthStore;
  private readonly fetchGraph: GraphFetch;
  private readonly randomToken: () => string;

  constructor(dependencies: FacebookOAuthServiceDependencies) {
    this.appId = dependencies.appId ?? process.env.META_APP_ID;
    this.appSecret = dependencies.appSecret ?? process.env.META_APP_SECRET;
    this.redirectUri = dependencies.redirectUri ?? process.env.META_OAUTH_REDIRECT_URI;
    this.graphApiVersion = dependencies.graphApiVersion ?? process.env.META_GRAPH_API_VERSION ?? "v26.0";
    this.stateStore = dependencies.stateStore;
    this.fetchGraph = dependencies.fetchGraph ?? fetch;
    this.randomToken = dependencies.randomToken ?? randomUUID;
  }

  async start(userId: string): Promise<{ authorizationUrl: string }> {
    const appId = requiredString(this.appId, "META_APP_ID");
    const redirectUri = requiredString(this.redirectUri, "META_OAUTH_REDIRECT_URI");
    const state = this.randomToken();
    await this.stateStore.save(state, { kind: "oauth", userId }, OAUTH_STATE_TTL_SECONDS);

    const url = new URL(`https://www.facebook.com/${this.graphApiVersion}/dialog/oauth`);
    url.searchParams.set("client_id", appId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("scope", "pages_show_list,pages_read_engagement,pages_manage_posts");
    return { authorizationUrl: url.toString() };
  }

  async finish(state: string, code: string): Promise<{ userId: string; selectionToken: string; pages: FacebookOAuthPage[] }> {
    const saved = await this.stateStore.consume(state);
    if (!saved || saved.kind !== "oauth") throw new AppError(400, "FACEBOOK_OAUTH_STATE_INVALID", "Facebook OAuth state is invalid or expired");
    const appId = requiredString(this.appId, "META_APP_ID");
    const appSecret = requiredString(this.appSecret, "META_APP_SECRET");
    const redirectUri = requiredString(this.redirectUri, "META_OAUTH_REDIRECT_URI");

    const tokenUrl = new URL(`https://graph.facebook.com/${this.graphApiVersion}/oauth/access_token`);
    tokenUrl.searchParams.set("client_id", appId);
    tokenUrl.searchParams.set("client_secret", appSecret);
    tokenUrl.searchParams.set("redirect_uri", redirectUri);
    tokenUrl.searchParams.set("code", code);
    const tokenResponse = await graphJson(this.fetchGraph, tokenUrl, "FACEBOOK_OAUTH_CODE_EXCHANGE_FAILED");
    const userAccessToken = tokenResponse.access_token;
    if (typeof userAccessToken !== "string" || !userAccessToken) throw new AppError(502, "FACEBOOK_OAUTH_CODE_EXCHANGE_FAILED", "Facebook did not return an access token");

    const pagesUrl = new URL(`https://graph.facebook.com/${this.graphApiVersion}/me/accounts`);
    pagesUrl.searchParams.set("fields", "id,name,access_token,tasks");
    pagesUrl.searchParams.set("access_token", userAccessToken);
    const pagesResponse = await graphJson(this.fetchGraph, pagesUrl, "FACEBOOK_OAUTH_PAGES_FAILED");
    const rawPages = Array.isArray(pagesResponse.data) ? pagesResponse.data : [];
    const pages = rawPages.flatMap((value): FacebookOAuthPageSecret[] => {
      if (!value || typeof value !== "object") return [];
      const page = value as GraphPage;
      if (typeof page.id !== "string" || typeof page.name !== "string" || typeof page.access_token !== "string") return [];
      const tasks = Array.isArray(page.tasks) ? page.tasks : [];
      return [{ id: page.id, name: page.name, accessToken: page.access_token, canPublish: tasks.includes("CREATE_CONTENT") }];
    });
    const selectionToken = this.randomToken();
    await this.stateStore.save(selectionToken, { kind: "selection", userId: saved.userId, pages }, OAUTH_STATE_TTL_SECONDS);
    return { userId: saved.userId, selectionToken, pages: pages.map(({ accessToken: _accessToken, ...page }) => page) };
  }

  async getSelection(userId: string, selectionToken: string): Promise<FacebookOAuthPage[]> {
    const saved = await this.stateStore.consume(selectionToken);
    if (!saved || saved.kind !== "selection" || saved.userId !== userId) throw new AppError(400, "FACEBOOK_OAUTH_SELECTION_INVALID", "Facebook Page selection is invalid or expired");
    await this.stateStore.save(selectionToken, saved, OAUTH_STATE_TTL_SECONDS);
    return saved.pages.map(({ accessToken: _accessToken, ...page }) => page);
  }

  async select(userId: string, selectionToken: string, pageId: string, connect: (userId: string, input: { pageId: string; pageAccessToken: string }) => Promise<unknown>): Promise<unknown> {
    const saved = await this.stateStore.consume(selectionToken);
    if (!saved || saved.kind !== "selection" || saved.userId !== userId) throw new AppError(400, "FACEBOOK_OAUTH_SELECTION_INVALID", "Facebook Page selection is invalid or expired");
    const page = saved.pages.find((candidate) => candidate.id === pageId);
    if (!page || !page.canPublish) throw new AppError(400, "FACEBOOK_OAUTH_PAGE_NOT_PUBLISHABLE", "The selected Facebook Page cannot publish content");
    return connect(userId, { pageId: page.id, pageAccessToken: page.accessToken });
  }
}

export const facebookOAuthService = new FacebookOAuthService({ stateStore: facebookOAuthStore });
