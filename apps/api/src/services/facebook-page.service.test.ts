import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const settingHistoryModelMocks = vi.hoisted(() => ({
  create: vi.fn(),
  find: vi.fn(),
  deleteMany: vi.fn()
}));

const settingHistoryServiceMocks = vi.hoisted(() => ({
  recordSettingHistory: vi.fn()
}));

vi.mock("../models/setting-history.model.js", () => ({
  SettingHistoryModel: settingHistoryModelMocks
}));
vi.mock("./setting-history.service.js", async () => {
  const actual = await vi.importActual<typeof import("./setting-history.service.js")>("./setting-history.service.js");
  settingHistoryServiceMocks.recordSettingHistory.mockImplementation(actual.recordSettingHistory);
  return { ...actual, recordSettingHistory: settingHistoryServiceMocks.recordSettingHistory };
});

import { AppError } from "../common/errors.js";
import { FacebookOAuthService } from "./facebook-oauth.service.js";
import type { FacebookPageServiceDependencies } from "./facebook-page.service.js";

let FacebookPageService: typeof import("./facebook-page.service.js").FacebookPageService;

beforeAll(async () => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("MONGODB_URI", "mongodb://localhost:27017/nhuu-chat");
  vi.stubEnv("REDIS_URL", "redis://localhost:6379");
  vi.stubEnv("JWT_SECRET", "a-jwt-secret-that-is-at-least-32-characters");
  vi.stubEnv("ENCRYPTION_KEY", "an-encryption-key-that-is-32-characters");
  vi.stubEnv("TELEGRAM_BOT_TOKEN", "123456789:test-token");
  vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "a-telegram-webhook-secret");
  vi.stubEnv("WEB_ALLOWED_ORIGINS", "http://localhost:5173");
  ({ FacebookPageService } = await import("./facebook-page.service.js"));
});

function record(overrides: Record<string, unknown> = {}) {
  return {
    _id: "connection-1",
    userId: "user-1",
    pageId: "page-123",
    pageName: "Nhuu Store",
    avatarUrl: "https://cdn.example/avatar.jpg",
    encryptedPageAccessToken: "ciphertext:token",
    status: "connected",
    lastValidatedAt: new Date("2026-09-21T10:00:00.000Z"),
    lastErrorCode: null,
    createdAt: new Date("2026-09-21T09:00:00.000Z"),
    updatedAt: new Date("2026-09-21T10:00:00.000Z"),
    ...overrides
  };
}

function connectionQuery(value: unknown) {
  const query = { select: vi.fn(), sort: vi.fn(), lean: vi.fn().mockResolvedValue(value) };
  query.select.mockReturnValue(query);
  query.sort.mockReturnValue(query);
  return query;
}

function dependencies(fetchResponse: unknown = {
  id: "page-123",
  name: "Nhuu Store",
  picture: { data: { url: "https://cdn.example/avatar.jpg" } }
}) {
  const model = {
    findOne: vi.fn(),
    find: vi.fn(),
    findOneAndUpdate: vi.fn(),
    create: vi.fn(),
    findOneAndDelete: vi.fn()
  };
  model.findOne.mockReturnValue(connectionQuery(null));
  model.find.mockReturnValue({ sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }) });
  let savedRecord: ReturnType<typeof record> | null = null;
  model.create.mockImplementation(async (input: Record<string, unknown>) => {
    savedRecord = record(input);
    return savedRecord;
  });
  model.findOneAndUpdate.mockImplementation(async (_filter: unknown, update: { $set: Record<string, unknown> }) => {
    savedRecord = record({ ...savedRecord, ...update.$set });
    return savedRecord;
  });
  const fetchGraph = vi.fn().mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue(fetchResponse) });
  const messengerClient = {
    subscribePage: vi.fn().mockResolvedValue(undefined),
    unsubscribePage: vi.fn().mockResolvedValue(undefined)
  };
  const deps: FacebookPageServiceDependencies = {
    model: model as never,
    fetchGraph,
    encryptSecret: vi.fn((value: string) => `ciphertext:${value}`),
    decryptSecret: vi.fn((value: string) => value.replace(/^ciphertext:/, "")),
    messengerClient,
    graphApiVersion: "v26.0"
  };
  return { deps, model, fetchGraph, messengerClient };
}

function retentionQuery(rows: Array<{ _id: string }> = []) {
  const historyQuery = {
    sort: vi.fn(),
    select: vi.fn(),
    lean: vi.fn().mockResolvedValue(rows)
  };
  historyQuery.sort.mockReturnValue(historyQuery);
  historyQuery.select.mockReturnValue(historyQuery);
  return historyQuery;
}

describe("FacebookPageService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    settingHistoryModelMocks.create.mockResolvedValue({ _id: "history-1" });
    settingHistoryModelMocks.find.mockReturnValue(retentionQuery());
    settingHistoryModelMocks.deleteMany.mockResolvedValue({ deletedCount: 0 });
  });

  it("validates Graph metadata before encrypting and persists only encrypted credentials", async () => {
    const { deps, model, fetchGraph } = dependencies();
    model.create.mockResolvedValue(record());
    const service = new FacebookPageService(deps);

    const result = await service.connect("user-1", { pageId: "page-123", pageAccessToken: "secret-token" });

    expect(fetchGraph).toHaveBeenCalledWith(
      "https://graph.facebook.com/v26.0/page-123?fields=id%2Cname%2Cpicture.type%28large%29&access_token=secret-token",
      expect.objectContaining({ method: "GET" })
    );
    expect(fetchGraph).toHaveBeenCalledOnce();
    expect(deps.encryptSecret).toHaveBeenCalledWith("secret-token");
    expect(model.create).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      platform: "facebook",
      pageId: "page-123",
      pageName: "Nhuu Store",
      avatarUrl: "https://cdn.example/avatar.jpg",
      status: "invalid",
      encryptedPageAccessToken: "ciphertext:secret-token"
    }));
    expect(model.create.mock.calls[0]?.[0]).not.toHaveProperty("pageAccessToken");
    expect(result).not.toHaveProperty("pageAccessToken");
    expect(result).not.toHaveProperty("encryptedPageAccessToken");
    expect(result).toMatchObject({
      id: "connection-1",
      pageId: "page-123",
      pageName: "Nhuu Store",
      avatarUrl: "https://cdn.example/avatar.jpg",
      status: "connected"
    });
  });

  it("subscribes only after the Page identity, owner, and DB reservation are validated", async () => {
    const { deps, model, messengerClient } = dependencies();
    model.create.mockResolvedValue(record());

    await new FacebookPageService(deps).connect("user-1", { pageId: "page-123", pageAccessToken: "private-token" });

    expect(messengerClient.subscribePage).toHaveBeenCalledWith({ pageId: "page-123", pageAccessToken: "private-token" });
    expect(messengerClient.subscribePage.mock.invocationCallOrder[0]).toBeGreaterThan(model.findOne.mock.invocationCallOrder[0]!);
    expect(messengerClient.subscribePage.mock.invocationCallOrder[0]).toBeGreaterThan(model.create.mock.invocationCallOrder[0]!);
    expect(messengerClient.subscribePage.mock.invocationCallOrder[0]).toBeLessThan(model.findOneAndUpdate.mock.invocationCallOrder[0]!);
  });

  it("does not subscribe or persist when Page identity is invalid", async () => {
    const { deps, model, messengerClient } = dependencies({ id: "different-page" });

    await expect(new FacebookPageService(deps).connect("user-1", { pageId: "page-123", pageAccessToken: "private-token" }))
      .rejects.toMatchObject({ code: "FACEBOOK_PAGE_ID_MISMATCH" });

    expect(messengerClient.subscribePage).not.toHaveBeenCalled();
    expect(model.create).not.toHaveBeenCalled();
  });

  it("retains an invalid Page reservation when Meta denies webhook subscription", async () => {
    const { deps, model, messengerClient } = dependencies();
    messengerClient.subscribePage.mockRejectedValue(new AppError(403, "FACEBOOK_MESSENGER_PERMISSION_DENIED", "Permission denied"));

    await expect(new FacebookPageService(deps).connect("user-1", { pageId: "page-123", pageAccessToken: "private-token" }))
      .rejects.toMatchObject({ code: "FACEBOOK_MESSENGER_PERMISSION_DENIED" });

    expect(model.create).toHaveBeenCalledWith(expect.objectContaining({ pageId: "page-123", status: "invalid" }));
    expect(model.findOneAndDelete).not.toHaveBeenCalled();
  });

  it("adds a second Page without replacing or unsubscribing the first Page", async () => {
    const { deps, model, messengerClient } = dependencies({ id: "page-456" });
    model.findOne.mockReturnValue(connectionQuery(null));
    model.create.mockResolvedValue(record({ _id: "connection-2", pageId: "page-456" }));

    await new FacebookPageService(deps).connect("user-1", { pageId: "page-456", pageAccessToken: "new-token" });

    expect(model.create).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1", pageId: "page-456" }));
    expect(messengerClient.subscribePage).toHaveBeenCalledWith({ pageId: "page-456", pageAccessToken: "new-token" });
    expect(messengerClient.unsubscribePage).not.toHaveBeenCalled();
  });

  it("keeps the Page reserved when Meta unsubscribe fails without exposing its error", async () => {
    const { deps, model, messengerClient } = dependencies();
    model.findOne.mockReturnValue(connectionQuery(record()));
    model.findOneAndDelete.mockResolvedValue(record());
    messengerClient.unsubscribePage.mockRejectedValue(new Error("private-token raw Meta error"));

    await expect(new FacebookPageService(deps).remove("user-1"))
      .rejects.toMatchObject({ code: "FACEBOOK_MESSENGER_UNSUBSCRIBE_FAILED" });

    expect(model.findOneAndDelete).not.toHaveBeenCalled();
    expect(messengerClient.unsubscribePage).toHaveBeenCalledWith({ pageId: "page-123", pageAccessToken: "token" });
  });

  it("safely persists a null avatar when Graph returns an incomplete picture payload", async () => {
    const { deps, model } = dependencies({ id: "page-123", name: "Nhuu Store", picture: { data: {} } });
    const service = new FacebookPageService(deps);

    const result = await service.connect("user-1", { pageId: "page-123", pageAccessToken: "secret-token" });

    expect(model.create.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ avatarUrl: null }));
    expect(result.avatarUrl).toBeNull();
  });

  it("rejects a Page claimed by another owner without replacing the caller's connection", async () => {
    const { deps, model } = dependencies({ id: "page-456", name: "Other Page" });
    const original = record({ pageId: "page-123", encryptedPageAccessToken: "ciphertext:original" });
    model.findOne.mockImplementation((filter: { userId?: string | { $ne: string }; pageId?: string }) => connectionQuery(
      typeof filter.userId === "object" ? record({ userId: "user-2", pageId: "page-456" })
        : filter.pageId === "page-456" ? null : original
    ));
    model.findOneAndUpdate.mockRejectedValue(new Error("unexpected connection replacement"));
    const service = new FacebookPageService(deps);

    await expect(service.connect("user-1", { pageId: "page-456", pageAccessToken: "replacement" }))
      .rejects.toMatchObject({ statusCode: 409, code: "FACEBOOK_PAGE_ALREADY_CONNECTED" });
    expect(model.findOneAndUpdate).not.toHaveBeenCalled();
    expect(model.create).not.toHaveBeenCalled();
    expect(original).toMatchObject({ pageId: "page-123", encryptedPageAccessToken: "ciphertext:original" });
  });

  it("allows the same owner to reconnect the same Page", async () => {
    const { deps, model } = dependencies();
    model.findOne.mockImplementation((filter: { userId?: string | { $ne: string }; pageId?: string }) =>
      connectionQuery(typeof filter.userId === "object" || filter.pageId !== "page-123" ? null : record()));
    model.findOneAndUpdate.mockResolvedValue(record({ encryptedPageAccessToken: "ciphertext:replacement" }));

    await expect(new FacebookPageService(deps).connect("user-1", {
      pageId: "page-123", pageAccessToken: "replacement"
    })).resolves.toMatchObject({ pageId: "page-123" });
  });

  it("maps a concurrent Page uniqueness conflict to a safe error", async () => {
    const { deps, model } = dependencies();
    model.create.mockRejectedValueOnce({ code: 11000, keyPattern: { pageId: 1 }, message: "secret-token" })
      .mockRejectedValueOnce(new Error("unexpected retry"));

    await expect(new FacebookPageService(deps).connect("user-1", {
      pageId: "page-123", pageAccessToken: "secret-token"
    })).rejects.toEqual(new AppError(409, "FACEBOOK_PAGE_ALREADY_CONNECTED", "Facebook Page is already connected"));
  });

  it("uses the configured Graph API version when no service override is supplied", async () => {
    const { deps, model, fetchGraph } = dependencies();
    model.create.mockResolvedValue(record());
    const service = new FacebookPageService({ ...deps, graphApiVersion: undefined });

    await service.connect("user-1", { pageId: "page-123", pageAccessToken: "secret-token" });

    expect(fetchGraph).toHaveBeenCalledWith(expect.stringContaining("https://graph.facebook.com/v26.0/page-123"), expect.anything());
  });

  it("rejects a Graph token error without encrypting or persisting", async () => {
    const { deps, model } = dependencies({ error: { code: 190, message: "Invalid OAuth access token" } });
    const service = new FacebookPageService(deps);

    await expect(service.connect("user-1", { pageId: "page-123", pageAccessToken: "bad-token" })).rejects.toMatchObject({
      statusCode: 401,
      code: "FACEBOOK_PAGE_TOKEN_INVALID"
    });
    expect(deps.encryptSecret).not.toHaveBeenCalled();
    expect(model.findOneAndUpdate).not.toHaveBeenCalled();
    expect(model.create).not.toHaveBeenCalled();
  });

  it("rejects metadata for a different Page ID", async () => {
    const { deps, model } = dependencies({ id: "different-page", name: "Other Page" });
    const service = new FacebookPageService(deps);

    await expect(service.connect("user-1", { pageId: "page-123", pageAccessToken: "secret-token" })).rejects.toMatchObject({
      statusCode: 400,
      code: "FACEBOOK_PAGE_ID_MISMATCH"
    });
    expect(deps.encryptSecret).not.toHaveBeenCalled();
    expect(model.findOneAndUpdate).not.toHaveBeenCalled();
    expect(model.create).not.toHaveBeenCalled();
  });

  it("connects an identity-valid Page without probing Conversations API task eligibility", async () => {
    const { deps, model, fetchGraph } = dependencies();
    model.create.mockResolvedValue(record());
    fetchGraph.mockResolvedValueOnce({
      ok: true, status: 200,
      json: vi.fn().mockResolvedValue({ id: "page-123", name: "Nhuu Store" })
    }).mockResolvedValueOnce({
      ok: false, status: 403,
      json: vi.fn().mockResolvedValue({ error: { code: 200, message: "Conversations task denied for secret-token" } })
    });

    const connection = await new FacebookPageService(deps).connect("user-1", {
      pageId: "page-123", pageAccessToken: "secret-token"
    });

    expect(connection).toMatchObject({ pageId: "page-123", status: "connected" });
    expect(JSON.stringify(connection)).not.toMatch(/secret-token|ciphertext|Conversations task denied/);
    expect(fetchGraph).toHaveBeenCalledOnce();
    expect(model.create).toHaveBeenCalledOnce();
  });

  it("returns one user's connection without exposing encrypted storage", async () => {
    const { deps, model } = dependencies();
    model.findOne.mockReturnValue(connectionQuery(record()));
    const service = new FacebookPageService(deps);

    await expect(service.get("user-1")).resolves.toEqual(expect.objectContaining({ id: "connection-1", pageId: "page-123" }));
    expect(model.findOne).toHaveBeenCalledWith({ userId: "user-1" });
    expect((await service.get("user-1"))).not.toHaveProperty("encryptedPageAccessToken");
  });

  it("lists all Page connections without exposing token fields", async () => {
    const { deps, model } = dependencies();
    const listQuery = { sort: vi.fn(), lean: vi.fn().mockResolvedValue([
      record(), record({ _id: "connection-2", pageId: "page-456", pageName: "Second Page" })
    ]) };
    listQuery.sort.mockReturnValue(listQuery);
    model.find.mockReturnValue(listQuery);

    const pages = await new FacebookPageService(deps).list("user-1");

    expect(model.find).toHaveBeenCalledWith({ userId: "user-1" });
    expect(pages).toHaveLength(2);
    expect(pages[1]).toMatchObject({ pageId: "page-456", pageName: "Second Page" });
    expect(JSON.stringify(pages)).not.toMatch(/ciphertext|encryptedPageAccessToken/);
  });

  it("removes only the authenticated user's connection", async () => {
    const { deps, model } = dependencies();
    model.findOne.mockReturnValue(connectionQuery(record()));
    model.findOneAndDelete.mockResolvedValue(record());
    const service = new FacebookPageService(deps);

    await service.remove("user-1");

    expect(model.findOneAndDelete).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1", pageId: "page-123", status: "invalid", lastErrorCode: "FACEBOOK_MESSENGER_REMOVE_PENDING"
    }));
  });

  it("removes only the requested Page connection", async () => {
    const { deps, model } = dependencies();
    model.findOne.mockReturnValue(connectionQuery(record({ pageId: "page-456" })));
    model.findOneAndUpdate.mockResolvedValue(record({ pageId: "page-456" }));
    model.findOneAndDelete.mockResolvedValue(record({ pageId: "page-456" }));

    await new FacebookPageService(deps).remove("user-1", "page-456");

    expect(model.findOne).toHaveBeenCalledWith({ userId: "user-1", pageId: "page-456" });
    expect(model.findOneAndDelete).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1", pageId: "page-456" }));
  });

  it("records a connect action with previous and saved safe Page metadata only", async () => {
    const { deps, model } = dependencies({ id: "page-456", name: "Nhuu New" });
    model.findOne.mockReturnValue(connectionQuery(null));
    model.create.mockResolvedValue(record({
      _id: "connection-2",
      pageId: "page-456",
      pageName: "Nhuu New",
      encryptedPageAccessToken: "ciphertext:new-token"
    }));
    model.findOneAndUpdate.mockResolvedValue(record({
      _id: "connection-2", pageId: "page-456", pageName: "Nhuu New", encryptedPageAccessToken: "ciphertext:new-token"
    }));
    const service = new FacebookPageService(deps);

    await service.connect("user-1", { pageId: "page-456", pageAccessToken: "new-secret-token" });

    expect(settingHistoryServiceMocks.recordSettingHistory).toHaveBeenCalledWith({
      userId: "user-1",
      actionType: "CONNECT_FACEBOOK_PAGE",
      actionTitle: "Kết nối Facebook Page",
      oldValue: {},
      newValue: { pageId: "page-456", pageName: "Nhuu New", status: "connected" }
    });
    expect(JSON.stringify(settingHistoryServiceMocks.recordSettingHistory.mock.calls[0]?.[0]))
      .not.toMatch(/token|ciphertext|new-secret/i);
    await vi.waitFor(() => expect(settingHistoryModelMocks.create).toHaveBeenCalledWith(expect.objectContaining({
      actionType: "CONNECT_FACEBOOK_PAGE",
      changes: [
        { fieldName: "pageId", oldValue: "(không có)", newValue: "page-456" },
        { fieldName: "pageName", oldValue: "(không có)", newValue: "Nhuu New" },
        { fieldName: "status", oldValue: "(không có)", newValue: "connected" }
      ]
    })));
  });

  it("records the removed Page identity without its encrypted token", async () => {
    const { deps, model } = dependencies();
    model.findOne.mockReturnValue(connectionQuery(record()));
    model.findOneAndDelete.mockResolvedValue(record());
    const service = new FacebookPageService(deps);

    await service.remove("user-1");

    expect(settingHistoryServiceMocks.recordSettingHistory).toHaveBeenCalledWith({
      userId: "user-1",
      actionType: "DISCONNECT_FACEBOOK_PAGE",
      actionTitle: "Ngắt kết nối Facebook Page",
      oldValue: { pageId: "page-123", pageName: "Nhuu Store", status: "connected" },
      newValue: {}
    });
    expect(JSON.stringify(settingHistoryServiceMocks.recordSettingHistory.mock.calls[0]?.[0]))
      .not.toMatch(/token|ciphertext/i);
    await vi.waitFor(() => expect(settingHistoryModelMocks.create).toHaveBeenCalledWith(expect.objectContaining({
      actionType: "DISCONNECT_FACEBOOK_PAGE",
      changes: [
        { fieldName: "pageId", oldValue: "page-123", newValue: "(không có)" },
        { fieldName: "pageName", oldValue: "Nhuu Store", newValue: "(không có)" },
        { fieldName: "status", oldValue: "connected", newValue: "(không có)" }
      ]
    })));
  });

  it("connects a messaging-only OAuth Page and creates one history record", async () => {
    const { deps, model, fetchGraph } = dependencies();
    model.create.mockResolvedValue(record());
    const service = new FacebookPageService(deps);
    const oauthStore = {
      save: vi.fn(),
      read: vi.fn(),
      consume: vi.fn(),
      claim: vi.fn().mockResolvedValue({
        kind: "selection",
        userId: "user-1",
        pages: [{
          id: "page-123",
          name: "Nhuu Store",
          accessToken: "oauth-page-secret",
          canPublish: false,
          canMessage: true
        }]
      }),
      releaseClaim: vi.fn(),
      consumeClaim: vi.fn().mockResolvedValue(undefined)
    };
    const oauth = new FacebookOAuthService({ stateStore: oauthStore, randomToken: () => "claim-1" });

    await oauth.select(
      "user-1",
      "selection-1",
      "page-123",
      (userId, input) => service.connect(userId, input)
    );

    expect(fetchGraph).toHaveBeenCalledOnce();
    expect(settingHistoryServiceMocks.recordSettingHistory).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(settingHistoryModelMocks.create).toHaveBeenCalledOnce());
    expect(JSON.stringify(settingHistoryServiceMocks.recordSettingHistory.mock.calls[0]?.[0]))
      .not.toContain("oauth-page-secret");
  });

  it("keeps a successful Facebook connection successful when history persistence fails", async () => {
    const historyError = new Error("history unavailable");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    settingHistoryServiceMocks.recordSettingHistory.mockRejectedValueOnce(historyError);
    const { deps, model } = dependencies();
    model.create.mockResolvedValue(record());
    const service = new FacebookPageService(deps);

    await expect(service.connect("user-1", {
      pageId: "page-123",
      pageAccessToken: "secret-token"
    })).resolves.toMatchObject({ pageId: "page-123", status: "connected" });

    expect(settingHistoryServiceMocks.recordSettingHistory).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(consoleError).toHaveBeenCalledWith(
      "Failed to record setting history",
      expect.objectContaining({ userId: "user-1", actionType: "CONNECT_FACEBOOK_PAGE", error: historyError })
    ));
    consoleError.mockRestore();
  });

  it.each([
    ["transport failures", () => Promise.reject(new Error("network down"))],
    ["JSON failures", () => Promise.resolve({ ok: true, json: vi.fn().mockRejectedValue(new Error("malformed JSON")) })]
  ])("maps Graph %s to a safe 4xx validation error", async (_name, failure) => {
    const { deps, fetchGraph } = dependencies();
    fetchGraph.mockImplementation(failure as never);
    const service = new FacebookPageService(deps);

    await expect(service.connect("user-1", { pageId: "page-123", pageAccessToken: "secret-token" })).rejects.toEqual(
      new AppError(400, "FACEBOOK_PAGE_VALIDATION_FAILED", "Facebook Page credentials could not be validated")
    );
  });

  it("bounds a stalled Graph fetch, aborts it, and ignores late completion", async () => {
    const { deps, model, fetchGraph } = dependencies();
    let observedSignal: AbortSignal | null | undefined;
    let resolveFetch!: (response: Response) => void;
    fetchGraph.mockImplementation((_input: string, init?: RequestInit) => {
      observedSignal = init?.signal;
      return new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      });
    });
    const service = new FacebookPageService({ ...deps, graphRequestTimeoutMs: 50 });
    vi.useFakeTimers();

    try {
      const connection = service.connect("user-1", { pageId: "page-123", pageAccessToken: "secret-token" });
      const errorPromise = connection.catch((caught: unknown) => caught);
      await vi.advanceTimersByTimeAsync(0);

      expect(observedSignal?.aborted).toBe(false);

      await vi.advanceTimersByTimeAsync(50);

      expect(observedSignal?.aborted).toBe(true);
      await expect(errorPromise).resolves.toEqual(
        new AppError(400, "FACEBOOK_PAGE_VALIDATION_FAILED", "Facebook Page credentials could not be validated")
      );

      resolveFetch({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ id: "page-123", name: "Nhuu Store" })
      } as unknown as Response);
      await vi.advanceTimersByTimeAsync(0);

      expect(deps.encryptSecret).not.toHaveBeenCalled();
      expect(model.findOneAndUpdate).not.toHaveBeenCalled();
      expect(model.create).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("bounds stalled Graph body parsing, aborts it, and ignores late completion", async () => {
    const { deps, model, fetchGraph } = dependencies();
    let observedSignal: AbortSignal | null | undefined;
    let bodyStarted = false;
    let resolveBody!: (body: unknown) => void;
    fetchGraph.mockImplementation(async (_input: string, init?: RequestInit) => {
      observedSignal = init?.signal;
      return {
        ok: true,
        status: 200,
        json: () => {
          bodyStarted = true;
          return new Promise<unknown>((resolve) => {
            resolveBody = resolve;
          });
        }
      } as Response;
    });
    const service = new FacebookPageService({ ...deps, graphRequestTimeoutMs: 50 });
    vi.useFakeTimers();

    try {
      const connection = service.connect("user-1", { pageId: "page-123", pageAccessToken: "secret-token" });
      const errorPromise = connection.catch((caught: unknown) => caught);
      await vi.advanceTimersByTimeAsync(0);

      expect(bodyStarted).toBe(true);
      expect(observedSignal?.aborted).toBe(false);

      await vi.advanceTimersByTimeAsync(50);

      expect(observedSignal?.aborted).toBe(true);
      await expect(errorPromise).resolves.toEqual(
        new AppError(400, "FACEBOOK_PAGE_VALIDATION_FAILED", "Facebook Page credentials could not be validated")
      );

      resolveBody({ id: "page-123", name: "Nhuu Store" });
      await vi.advanceTimersByTimeAsync(0);

      expect(deps.encryptSecret).not.toHaveBeenCalled();
      expect(model.findOneAndUpdate).not.toHaveBeenCalled();
      expect(model.create).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
