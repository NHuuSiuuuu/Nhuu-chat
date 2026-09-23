import { beforeEach, describe, expect, it, vi } from "vitest";

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
import { FacebookPageService, type FacebookPageServiceDependencies } from "./facebook-page.service.js";

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

function dependencies(fetchResponse: unknown = {
  id: "page-123",
  name: "Nhuu Store",
  picture: { data: { url: "https://cdn.example/avatar.jpg" } }
}) {
  const model = {
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    create: vi.fn(),
    findOneAndDelete: vi.fn()
  };
  model.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
  const fetchGraph = vi.fn().mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue(fetchResponse) });
  const deps: FacebookPageServiceDependencies = {
    model: model as never,
    fetchGraph,
    encryptSecret: vi.fn((value: string) => `ciphertext:${value}`),
    graphApiVersion: "v26.0"
  };
  return { deps, model, fetchGraph };
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
    expect(deps.encryptSecret).toHaveBeenCalledWith("secret-token");
    expect(model.create).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      platform: "facebook",
      pageId: "page-123",
      pageName: "Nhuu Store",
      avatarUrl: "https://cdn.example/avatar.jpg",
      status: "connected",
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

  it("safely persists a null avatar when Graph returns an incomplete picture payload", async () => {
    const { deps, model } = dependencies({ id: "page-123", name: "Nhuu Store", picture: { data: {} } });
    model.create.mockResolvedValue(record({ avatarUrl: null }));
    const service = new FacebookPageService(deps);

    const result = await service.connect("user-1", { pageId: "page-123", pageAccessToken: "secret-token" });

    expect(model.create.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ avatarUrl: null }));
    expect(result.avatarUrl).toBeNull();
  });

  it("rejects a Page claimed by another owner without replacing the caller's connection", async () => {
    const { deps, model } = dependencies({ id: "page-456", name: "Other Page" });
    const original = record({ pageId: "page-123", encryptedPageAccessToken: "ciphertext:original" });
    model.findOne.mockImplementation((filter: { userId?: string | { $ne: string } }) => ({
      lean: vi.fn().mockResolvedValue(typeof filter.userId === "object"
        ? record({ userId: "user-2", pageId: "page-456" })
        : original)
    }));
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
    model.findOne.mockImplementation((filter: { userId?: string | { $ne: string } }) => ({
      lean: vi.fn().mockResolvedValue(typeof filter.userId === "object" ? null : record())
    }));
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

  it("returns one user's connection without exposing encrypted storage", async () => {
    const { deps, model } = dependencies();
    model.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(record()) });
    const service = new FacebookPageService(deps);

    await expect(service.get("user-1")).resolves.toEqual(expect.objectContaining({ id: "connection-1", pageId: "page-123" }));
    expect(model.findOne).toHaveBeenCalledWith({ userId: "user-1" });
    expect((await service.get("user-1"))).not.toHaveProperty("encryptedPageAccessToken");
  });

  it("removes only the authenticated user's connection", async () => {
    const { deps, model } = dependencies();
    model.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(record()) });
    model.findOneAndDelete.mockResolvedValue(record());
    const service = new FacebookPageService(deps);

    await service.remove("user-1");

    expect(model.findOneAndDelete).toHaveBeenCalledWith({ userId: "user-1" });
  });

  it("records a connect action with previous and saved safe Page metadata only", async () => {
    const { deps, model } = dependencies({ id: "page-456", name: "Nhuu New" });
    model.findOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue(record({
        pageId: "page-123",
        pageName: "Nhuu Old",
        status: "invalid",
        encryptedPageAccessToken: "ciphertext:old-token"
      }))
    });
    model.findOneAndUpdate.mockResolvedValue(record({
      pageId: "page-456",
      pageName: "Nhuu New",
      encryptedPageAccessToken: "ciphertext:new-token"
    }));
    const service = new FacebookPageService(deps);

    await service.connect("user-1", { pageId: "page-456", pageAccessToken: "new-secret-token" });

    expect(settingHistoryServiceMocks.recordSettingHistory).toHaveBeenCalledWith({
      userId: "user-1",
      actionType: "CONNECT_FACEBOOK_PAGE",
      actionTitle: "Kết nối Facebook Page",
      oldValue: { pageId: "page-123", pageName: "Nhuu Old", status: "invalid" },
      newValue: { pageId: "page-456", pageName: "Nhuu New", status: "connected" }
    });
    expect(JSON.stringify(settingHistoryServiceMocks.recordSettingHistory.mock.calls[0]?.[0]))
      .not.toMatch(/token|ciphertext|new-secret/i);
    await vi.waitFor(() => expect(settingHistoryModelMocks.create).toHaveBeenCalledWith(expect.objectContaining({
      actionType: "CONNECT_FACEBOOK_PAGE",
      changes: [
        { fieldName: "pageId", oldValue: "page-123", newValue: "page-456" },
        { fieldName: "pageName", oldValue: "Nhuu Old", newValue: "Nhuu New" },
        { fieldName: "status", oldValue: "invalid", newValue: "connected" }
      ]
    })));
  });

  it("records the removed Page identity without its encrypted token", async () => {
    const { deps, model } = dependencies();
    model.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(record()) });
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

  it("creates one history record when OAuth selection delegates to connect", async () => {
    const { deps, model } = dependencies();
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
          canPublish: true
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
