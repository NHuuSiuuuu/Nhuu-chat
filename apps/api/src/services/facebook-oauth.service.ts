import { randomUUID } from "node:crypto";

import { AppError } from "../common/errors.js";
import { facebookOAuthStore } from "./facebook-oauth.store.js";

const OAUTH_STATE_TTL_SECONDS = 600;
const OAUTH_SELECTION_CLAIM_TTL_SECONDS = 600;
const FACEBOOK_GRAPH_ORIGIN = "https://graph.facebook.com";
const FACEBOOK_OAUTH_MAX_PAGE_COUNT = 25;

export interface FacebookOAuthStore {
  save(token: string, value: FacebookOAuthStoredValue, ttlSeconds: number): Promise<void>;
  read(token: string): Promise<FacebookOAuthStoredValue | undefined>;
  consume(token: string): Promise<FacebookOAuthStoredValue | undefined>;
  claim(token: string, claimToken: string, ttlSeconds: number): Promise<FacebookOAuthStoredValue | undefined>;
  releaseClaim(token: string, claimToken: string): Promise<void>;
  consumeClaim(token: string, claimToken: string): Promise<FacebookOAuthStoredValue | undefined>;
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

function facebookOAuthPagesError(): AppError {
  return new AppError(502, "FACEBOOK_OAUTH_PAGES_FAILED", "Facebook OAuth request failed");
}

// Chỉ theo liên kết phân trang HTTPS do Graph API trả về để không gửi token sang host khác.
function graphPagingNext(response: Record<string, unknown>): URL | undefined {
  if (response.paging === undefined || response.paging === null) return undefined;
  if (typeof response.paging !== "object") throw facebookOAuthPagesError();
  const next = (response.paging as Record<string, unknown>).next;
  if (next === undefined || next === null) return undefined;
  if (typeof next !== "string" || !next.trim()) throw facebookOAuthPagesError();

  let nextUrl: URL;
  try {
    nextUrl = new URL(next);
  } catch {
    throw facebookOAuthPagesError();
  }
  if (nextUrl.origin !== FACEBOOK_GRAPH_ORIGIN) throw facebookOAuthPagesError();
  return nextUrl;
}

// Thu thập toàn bộ Page trong giới hạn cố định và không lưu kết quả dở dang khi pagination lỗi.
async function fetchFacebookOAuthPages(fetchGraph: GraphFetch, firstUrl: URL): Promise<unknown[]> {
  const rawPages: unknown[] = [];
  let pageUrl = firstUrl;

  for (let pageCount = 0; pageCount < FACEBOOK_OAUTH_MAX_PAGE_COUNT; pageCount += 1) {
    const response = await graphJson(fetchGraph, pageUrl, "FACEBOOK_OAUTH_PAGES_FAILED");
    if (Array.isArray(response.data)) rawPages.push(...response.data);
    const nextUrl = graphPagingNext(response);
    if (!nextUrl) return rawPages;
    if (pageCount === FACEBOOK_OAUTH_MAX_PAGE_COUNT - 1) throw facebookOAuthPagesError();
    pageUrl = nextUrl;
  }

  throw facebookOAuthPagesError();
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
    const rawPages = await fetchFacebookOAuthPages(this.fetchGraph, pagesUrl);
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
    const saved = await this.stateStore.read(selectionToken);
    if (!saved || saved.kind !== "selection" || saved.userId !== userId) throw new AppError(400, "FACEBOOK_OAUTH_SELECTION_INVALID", "Facebook Page selection is invalid or expired");
    return saved.pages.map(({ accessToken: _accessToken, ...page }) => page);
  }

  async select(userId: string, selectionToken: string, pageId: string, connect: (userId: string, input: { pageId: string; pageAccessToken: string }) => Promise<unknown>): Promise<unknown> {
    const claimToken = this.randomToken();
    const saved = await this.stateStore.claim(selectionToken, claimToken, OAUTH_SELECTION_CLAIM_TTL_SECONDS);
    if (!saved) throw new AppError(400, "FACEBOOK_OAUTH_SELECTION_INVALID", "Facebook Page selection is invalid or expired");

    try {
      if (saved.kind !== "selection" || saved.userId !== userId) throw new AppError(400, "FACEBOOK_OAUTH_SELECTION_INVALID", "Facebook Page selection is invalid or expired");
      const page = saved.pages.find((candidate) => candidate.id === pageId);
      if (!page || !page.canPublish) throw new AppError(400, "FACEBOOK_OAUTH_PAGE_NOT_PUBLISHABLE", "The selected Facebook Page cannot publish content");
      const connection = await connect(userId, { pageId: page.id, pageAccessToken: page.accessToken });
      const consumed = await this.stateStore.consumeClaim(selectionToken, claimToken);
      if (!consumed) throw new AppError(400, "FACEBOOK_OAUTH_SELECTION_INVALID", "Facebook Page selection is invalid or expired");
      return connection;
    } catch (error) {
      await this.stateStore.releaseClaim(selectionToken, claimToken).catch(() => undefined);
      throw error;
    }
  }
}

export const facebookOAuthService = new FacebookOAuthService({ stateStore: facebookOAuthStore });
