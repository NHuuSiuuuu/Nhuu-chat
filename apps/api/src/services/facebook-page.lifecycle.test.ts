import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("./setting-history.service.js", () => ({ recordSettingHistory: vi.fn().mockResolvedValue(undefined) }));

import { AppError } from "../common/errors.js";

let FacebookPageService: typeof import("./facebook-page.service.js").FacebookPageService;

beforeAll(async () => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("MONGODB_URI", "mongodb://localhost:27017/nhuu-chat");
  vi.stubEnv("REDIS_URL", "redis://localhost:6379");
  vi.stubEnv("JWT_SECRET", "a-jwt-secret-that-is-at-least-32-characters");
  vi.stubEnv("ENCRYPTION_KEY", "an-encryption-key-that-is-32-characters");
  vi.stubEnv("TELEGRAM_BOT_TOKEN", "123456789:test-token");
  vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "a-telegram-webhook-secret");
  ({ FacebookPageService } = await import("./facebook-page.service.js"));
});

type PageRow = {
  _id: string;
  userId: string;
  pageId: string;
  encryptedPageAccessToken: string;
  pageName: string;
  status: "connected" | "invalid";
  lastErrorCode: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastValidatedAt: Date | null;
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function pageRow(userId: string, pageId: string): PageRow {
  return {
    _id: `connection-${userId}`,
    userId,
    pageId,
    pageName: pageId,
    encryptedPageAccessToken: `ciphertext:old-${userId}`,
    status: "connected",
    lastErrorCode: null,
    createdAt: new Date("2026-09-23T00:00:00Z"),
    updatedAt: new Date("2026-09-23T00:00:00Z"),
    lastValidatedAt: new Date("2026-09-23T00:00:00Z")
  };
}

// Mô phỏng index userId/pageId và CAS của Mongo qua các lời gọi bất đồng bộ.
function pageStore(initial: PageRow[] = []) {
  const rows = new Map(initial.map((row) => [row.userId, structuredClone(row)]));
  let sequence = 0;
  let failConnectedUpdate = false;
  let hideTokenOnUpdate = false;
  let dropClaimOnPageSwap = false;
  const copy = (row: PageRow | undefined) => row ? structuredClone(row) : null;
  const matches = (row: PageRow, filter: Record<string, unknown>) => Object.entries(filter).every(([key, value]) => {
    if (key === "userId" && value && typeof value === "object" && "$ne" in value) {
      return row.userId !== (value as { $ne: string }).$ne;
    }
    return row[key as keyof PageRow] === value;
  });
  const find = (filter: Record<string, unknown>) => [...rows.values()].find((row) => matches(row, filter));
  const model = {
    findOne: vi.fn((filter: Record<string, unknown>) => {
      const query = { select: () => query, lean: async () => copy(find(filter)) };
      return query;
    }),
    create: vi.fn(async (input: Record<string, unknown>) => {
      const candidate = input as Omit<PageRow, "_id" | "createdAt" | "updatedAt">;
      if (rows.has(candidate.userId)) throw { code: 11000, keyPattern: { userId: 1 } };
      if ([...rows.values()].some((row) => row.pageId === candidate.pageId)) {
        throw { code: 11000, keyPattern: { pageId: 1 } };
      }
      const row: PageRow = {
        ...candidate,
        _id: `connection-${++sequence}`,
        createdAt: new Date("2026-09-23T00:00:00Z"),
        updatedAt: new Date("2026-09-23T00:00:00Z")
      };
      rows.set(row.userId, row);
      return copy(row);
    }),
    findOneAndUpdate: vi.fn(async (filter: Record<string, unknown>, update: { $set: Partial<PageRow> }) => {
      const row = find(filter);
      if (!row) return null;
      if (failConnectedUpdate && update.$set.status === "connected") {
        failConnectedUpdate = false;
        throw new Error("database unavailable after Meta subscription");
      }
      const next = { ...row, ...update.$set };
      if (dropClaimOnPageSwap && next.pageId !== row.pageId) {
        rows.delete(row.userId);
        throw new Error("database claim disappeared during Page swap");
      }
      if ([...rows.values()].some((other) => other.userId !== row.userId && other.pageId === next.pageId)) {
        throw { code: 11000, keyPattern: { pageId: 1 } };
      }
      rows.set(row.userId, next);
      const result = copy(next);
      if (hideTokenOnUpdate && result) delete (result as Partial<PageRow>).encryptedPageAccessToken;
      return result;
    }),
    findOneAndDelete: vi.fn(async (filter: Record<string, unknown>) => {
      const row = find(filter);
      if (!row) return null;
      rows.delete(row.userId);
      return copy(row);
    })
  };
  return {
    model,
    current: (userId: string) => copy(rows.get(userId)),
    failNextConnectedUpdate: () => { failConnectedUpdate = true; },
    hideTokenOnUpdate: () => { hideTokenOnUpdate = true; },
    dropClaimOnPageSwap: () => { dropClaimOnPageSwap = true; },
    insertExternal: (row: PageRow) => { rows.set(row.userId, structuredClone(row)); }
  };
}

function service(store: ReturnType<typeof pageStore>, messengerClient: {
  subscribePage: (input: { pageId: string; pageAccessToken: string }) => Promise<void>;
  unsubscribePage: (input: { pageId: string; pageAccessToken: string }) => Promise<void>;
}) {
  let encryptionSequence = 0;
  return new FacebookPageService({
    model: store.model as never,
    fetchGraph: async (input) => {
      const pageId = new URL(input).pathname.split("/").at(-1);
      return new Response(JSON.stringify({ id: pageId, name: pageId }), { status: 200 });
    },
    messengerClient,
    encryptSecret: (value) => `ciphertext:${++encryptionSequence}:${value}`,
    decryptSecret: (value) => value.replace(/^ciphertext:(?:\d+:)?/, ""),
    graphApiVersion: "v26.0"
  });
}

describe("Facebook Page subscription ownership lifecycle", () => {
  it("finalizes connect and removal when update results hide the encrypted token", async () => {
    const store = pageStore();
    store.hideTokenOnUpdate();
    const messengerClient = { subscribePage: vi.fn().mockResolvedValue(undefined), unsubscribePage: vi.fn().mockResolvedValue(undefined) };
    const connection = service(store, messengerClient);

    await expect(connection.connect("owner-1", { pageId: "page-a", pageAccessToken: "owner-token" }))
      .resolves.toMatchObject({ pageId: "page-a", status: "connected" });
    await expect(connection.remove("owner-1")).resolves.toBeUndefined();
    expect(store.current("owner-1")).toBeNull();
  });

  it("replaces a Page when update results hide the encrypted token", async () => {
    const store = pageStore([pageRow("owner-1", "page-a")]);
    store.hideTokenOnUpdate();
    const messengerClient = { subscribePage: vi.fn().mockResolvedValue(undefined), unsubscribePage: vi.fn().mockResolvedValue(undefined) };
    const connection = service(store, messengerClient);

    await expect(connection.connect("owner-1", { pageId: "page-b", pageAccessToken: "new-token" }))
      .resolves.toMatchObject({ pageId: "page-b", status: "connected" });
    expect(store.current("owner-1")?.encryptedPageAccessToken).toContain("new-token");
  });

  it("keeps a Page reserved and resumable when persistence fails after Meta subscribes", async () => {
    const store = pageStore();
    store.failNextConnectedUpdate();
    const messengerClient = { subscribePage: vi.fn().mockResolvedValue(undefined), unsubscribePage: vi.fn().mockResolvedValue(undefined) };
    const connection = service(store, messengerClient);

    await expect(connection.connect("owner-1", { pageId: "page-a", pageAccessToken: "owner-token" })).rejects.toBeDefined();

    expect(store.current("owner-1")).toMatchObject({ pageId: "page-a", status: "invalid" });
    await expect(connection.connect("owner-2", { pageId: "page-a", pageAccessToken: "other-token" }))
      .rejects.toMatchObject({ code: "FACEBOOK_PAGE_ALREADY_CONNECTED" });
    expect(messengerClient.unsubscribePage).not.toHaveBeenCalled();
    await expect(connection.connect("owner-1", { pageId: "page-a", pageAccessToken: "owner-token" }))
      .resolves.toMatchObject({ pageId: "page-a", status: "connected" });
  });

  it("keeps an ambiguous timed-out subscription reserved from removal", async () => {
    const store = pageStore();
    const messengerClient = {
      subscribePage: vi.fn().mockRejectedValue(new AppError(504, "FACEBOOK_MESSENGER_TIMEOUT", "private-token Meta timeout")),
      unsubscribePage: vi.fn().mockResolvedValue(undefined)
    };
    const connection = service(store, messengerClient);

    await expect(connection.connect("owner-1", { pageId: "page-a", pageAccessToken: "private-token" }))
      .rejects.toMatchObject({ code: "FACEBOOK_MESSENGER_TIMEOUT" });
    expect(store.current("owner-1")).toMatchObject({
      pageId: "page-a", status: "invalid", lastErrorCode: "FACEBOOK_MESSENGER_SUBSCRIBE_PENDING"
    });
    await expect(connection.remove("owner-1")).rejects.toMatchObject({ code: "FACEBOOK_PAGE_CONNECTION_BUSY" });
    expect(messengerClient.unsubscribePage).not.toHaveBeenCalled();
  });

  it("holds a new Page claim while its Meta subscribe call is delayed", async () => {
    const store = pageStore();
    const entered = deferred<void>();
    const release = deferred<void>();
    const messengerClient = {
      subscribePage: vi.fn(async () => { entered.resolve(); await release.promise; }),
      unsubscribePage: vi.fn().mockResolvedValue(undefined)
    };
    const connection = service(store, messengerClient);

    const pending = connection.connect("owner-1", { pageId: "page-a", pageAccessToken: "owner-token" });
    await entered.promise;
    expect(store.current("owner-1")).toMatchObject({ pageId: "page-a", status: "invalid" });
    await expect(connection.connect("owner-2", { pageId: "page-a", pageAccessToken: "other-token" }))
      .rejects.toMatchObject({ code: "FACEBOOK_PAGE_ALREADY_CONNECTED" });
    release.resolve();
    await expect(pending).resolves.toMatchObject({ pageId: "page-a", status: "connected" });
  });

  it("restores the old subscription when another owner claims the replacement Page before CAS", async () => {
    const store = pageStore([pageRow("owner-1", "page-a")]);
    const messengerClient = {
      subscribePage: vi.fn().mockResolvedValue(undefined),
      unsubscribePage: vi.fn(async () => { store.insertExternal(pageRow("owner-2", "page-b")); })
    };
    const connection = service(store, messengerClient);

    await expect(connection.connect("owner-1", { pageId: "page-b", pageAccessToken: "new-token" }))
      .rejects.toMatchObject({ code: "FACEBOOK_PAGE_ALREADY_CONNECTED" });

    expect(store.current("owner-1")).toMatchObject({ pageId: "page-a", status: "connected" });
    expect(messengerClient.subscribePage).toHaveBeenCalledWith({ pageId: "page-a", pageAccessToken: "old-owner-1" });
    expect(messengerClient.subscribePage).not.toHaveBeenCalledWith({ pageId: "page-b", pageAccessToken: "new-token" });
  });

  it("does not restore Meta subscription after the old DB claim disappears", async () => {
    const store = pageStore([pageRow("owner-1", "page-a")]);
    store.dropClaimOnPageSwap();
    const messengerClient = { subscribePage: vi.fn().mockResolvedValue(undefined), unsubscribePage: vi.fn().mockResolvedValue(undefined) };
    const connection = service(store, messengerClient);

    await expect(connection.connect("owner-1", { pageId: "page-b", pageAccessToken: "new-token" }))
      .rejects.toMatchObject({ code: "FACEBOOK_PAGE_CONNECTION_FAILED" });

    expect(store.current("owner-1")).toBeNull();
    expect(messengerClient.subscribePage).not.toHaveBeenCalled();
  });

  it("holds the old Page claim while replacement unsubscribe is delayed", async () => {
    const store = pageStore([pageRow("owner-1", "page-a")]);
    const entered = deferred<void>();
    const release = deferred<void>();
    const messengerClient = {
      subscribePage: vi.fn().mockResolvedValue(undefined),
      unsubscribePage: vi.fn(async () => { entered.resolve(); await release.promise; })
    };
    const connection = service(store, messengerClient);

    const replacement = connection.connect("owner-1", { pageId: "page-b", pageAccessToken: "new-token" });
    await entered.promise;
    expect(store.current("owner-1")).toMatchObject({ pageId: "page-a", status: "invalid" });
    await expect(connection.connect("owner-2", { pageId: "page-a", pageAccessToken: "other-token" }))
      .rejects.toMatchObject({ code: "FACEBOOK_PAGE_ALREADY_CONNECTED" });
    release.resolve();
    await expect(replacement).resolves.toMatchObject({ pageId: "page-b", status: "connected" });
    expect(messengerClient.unsubscribePage).toHaveBeenCalledWith({ pageId: "page-a", pageAccessToken: "old-owner-1" });
  });

  it("does not delete a reconnect attempted while removal waits for Meta", async () => {
    const store = pageStore([pageRow("owner-1", "page-a")]);
    const entered = deferred<void>();
    const release = deferred<void>();
    const messengerClient = {
      subscribePage: vi.fn().mockResolvedValue(undefined),
      unsubscribePage: vi.fn(async () => { entered.resolve(); await release.promise; })
    };
    const connection = service(store, messengerClient);

    const removal = connection.remove("owner-1");
    await entered.promise;
    expect(store.current("owner-1")).toMatchObject({ pageId: "page-a", status: "invalid" });
    await expect(connection.connect("owner-1", { pageId: "page-a", pageAccessToken: "new-token" }))
      .rejects.toMatchObject({ statusCode: 409 });
    release.resolve();
    await removal;
    expect(store.current("owner-1")).toBeNull();
    await expect(connection.connect("owner-1", { pageId: "page-a", pageAccessToken: "new-token" }))
      .resolves.toMatchObject({ pageId: "page-a", status: "connected" });
    expect(store.current("owner-1")?.encryptedPageAccessToken).toContain("new-token");
  });

  it("does not delete a changed connection when removal's final CAS loses", async () => {
    const store = pageStore([pageRow("owner-1", "page-a")]);
    const messengerClient = {
      subscribePage: vi.fn().mockResolvedValue(undefined),
      unsubscribePage: vi.fn(async () => { store.insertExternal(pageRow("owner-1", "page-b")); })
    };
    const connection = service(store, messengerClient);

    await expect(connection.remove("owner-1")).rejects.toMatchObject({ code: "FACEBOOK_PAGE_CONNECTION_BUSY" });
    expect(store.current("owner-1")).toMatchObject({ pageId: "page-b", status: "connected" });
  });
});
