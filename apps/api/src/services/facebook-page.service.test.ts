import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "../common/errors.js";
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
    deleteOne: vi.fn()
  };
  const fetchGraph = vi.fn().mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue(fetchResponse) });
  const deps: FacebookPageServiceDependencies = {
    model: model as never,
    fetchGraph,
    encryptSecret: vi.fn((value: string) => `ciphertext:${value}`),
    graphApiVersion: "v26.0"
  };
  return { deps, model, fetchGraph };
}

describe("FacebookPageService", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("validates Graph metadata before encrypting and persists only encrypted credentials", async () => {
    const { deps, model, fetchGraph } = dependencies();
    model.findOneAndUpdate.mockResolvedValue(record());
    const service = new FacebookPageService(deps);

    const result = await service.connect("user-1", { pageId: "page-123", pageAccessToken: "secret-token" });

    expect(fetchGraph).toHaveBeenCalledWith(
      "https://graph.facebook.com/v26.0/page-123?fields=id%2Cname%2Cpicture.type%28large%29&access_token=secret-token",
      expect.objectContaining({ method: "GET" })
    );
    expect(deps.encryptSecret).toHaveBeenCalledWith("secret-token");
    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      { userId: "user-1" },
      expect.objectContaining({
        $set: expect.objectContaining({
          pageId: "page-123",
          pageName: "Nhuu Store",
          avatarUrl: "https://cdn.example/avatar.jpg",
          status: "connected"
        }),
        $setOnInsert: { userId: "user-1", platform: "facebook" }
      }),
      expect.objectContaining({ upsert: true, new: true, setDefaultsOnInsert: true })
    );
    expect(model.findOneAndUpdate.mock.calls[0]?.[1]).not.toContain("secret-token");
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
    model.findOneAndUpdate.mockResolvedValue(record({ avatarUrl: null }));
    const service = new FacebookPageService(deps);

    const result = await service.connect("user-1", { pageId: "page-123", pageAccessToken: "secret-token" });

    expect(model.findOneAndUpdate.mock.calls[0]?.[1]).toEqual(expect.objectContaining({
      $set: expect.objectContaining({ avatarUrl: null })
    }));
    expect(result.avatarUrl).toBeNull();
  });

  it("uses the configured Graph API version when no service override is supplied", async () => {
    const { deps, model, fetchGraph } = dependencies();
    model.findOneAndUpdate.mockResolvedValue(record());
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
    model.deleteOne.mockResolvedValue({ acknowledged: true, deletedCount: 1 });
    const service = new FacebookPageService(deps);

    await service.remove("user-1");

    expect(model.deleteOne).toHaveBeenCalledWith({ userId: "user-1" });
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
    } finally {
      vi.useRealTimers();
    }
  });
});
