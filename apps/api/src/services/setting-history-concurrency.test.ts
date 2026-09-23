import { beforeEach, describe, expect, it, vi } from "vitest";

const models = vi.hoisted(() => ({
  user: { findById: vi.fn(), findByIdAndUpdate: vi.fn() },
  history: { create: vi.fn(), find: vi.fn() }
}));

vi.mock("../models/user.model.js", () => ({ UserModel: models.user }));
vi.mock("../models/setting-history.model.js", () => ({ SettingHistoryModel: models.history }));

import { updateAiSettings } from "./ai-settings.service.js";
import { FacebookPageService, type FacebookPageServiceDependencies } from "./facebook-page.service.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

type Page = {
  _id: string;
  userId: string;
  pageId: string;
  pageName: string | null;
  status: "connected" | "invalid";
  encryptedPageAccessToken: string;
  lastErrorCode: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function page(pageId = "page-a"): Page {
  return {
    _id: "connection-1", userId: "user-1", pageId, pageName: pageId,
    status: "connected", lastErrorCode: null, encryptedPageAccessToken: "ciphertext:old-secret",
    createdAt: new Date("2026-09-22T08:00:00Z"), updatedAt: new Date("2026-09-22T08:00:00Z")
  };
}

// Mô phỏng ranh giới nguyên tử của Mongo; service, diff và recorder đều chạy thật.
function pageStore(initial: Page | null) {
  let current = initial;
  let nextId = 1;
  const copy = () => structuredClone(current);
  const model = {
    findOne: vi.fn((filter: { userId: string }) => {
      const query = {
        select: () => query,
        lean: async () => current?.userId === filter.userId ? copy() : null
      };
      return query;
    }),
    findOneAndUpdate: vi.fn(async (
      filter: Record<string, unknown>,
      update: { $set: Partial<Page>; $setOnInsert?: Record<string, unknown> },
      options: Record<string, unknown>
    ) => {
      const before = copy();
      const matches = current && Object.entries(filter).every(([key, value]) => current?.[key as keyof Page] === value);
      if (!matches && !options.upsert) return null;
      if (!matches && current) throw { code: 11000, keyPattern: { userId: 1 } };
      current = {
        ...(current ?? { ...page(), _id: `connection-${++nextId}` }),
        ...update.$setOnInsert, ...update.$set,
        updatedAt: new Date("2026-09-22T09:00:00Z")
      } as Page;
      return options.new === true || options.returnDocument === "after" ? copy() : before;
    }),
    create: vi.fn(async (input: Partial<Page>) => {
      if (current) throw { code: 11000, keyPattern: { userId: 1 } };
      current = { ...page(), _id: `connection-${++nextId}`, ...input };
      return copy()!;
    }),
    deleteOne: vi.fn(async (filter: { userId: string }) => {
      const deletedCount = current?.userId === filter.userId ? 1 : 0;
      if (deletedCount) current = null;
      return { deletedCount };
    }),
    findOneAndDelete: vi.fn(async (filter: Record<string, unknown>) => {
      if (!current || !Object.entries(filter).every(([key, value]) => current?.[key as keyof Page] === value)) return null;
      const deleted = copy();
      current = null;
      return deleted;
    })
  };
  return { model, current: copy };
}

function graphResponse(pageId: string) {
  return new Response(JSON.stringify({ id: pageId, name: pageId }), { status: 200 });
}

function pageService(model: FacebookPageServiceDependencies["model"], fetchGraph?: FacebookPageServiceDependencies["fetchGraph"]) {
  return new FacebookPageService({
    model,
    fetchGraph: fetchGraph ?? (async (url) => graphResponse(new URL(url).pathname.split("/").at(-1)!)),
    encryptSecret: (value) => `ciphertext:${value}`,
    decryptSecret: (value) => value.replace(/^ciphertext:/, ""),
    messengerClient: { subscribePage: async () => undefined, unsubscribePage: async () => undefined },
    graphApiVersion: "v26.0"
  });
}

function connect(service: FacebookPageService, pageId: string) {
  return service.connect("user-1", { pageId, pageAccessToken: "test-secret" });
}

function histories() {
  return models.history.create.mock.calls.map(([entry]) => entry);
}

beforeEach(() => {
  vi.resetAllMocks();
  models.history.create.mockImplementation(async (entry) => entry);
  const query = { sort: () => query, select: () => query, lean: async () => [] };
  models.history.find.mockReturnValue(query);
});

describe("atomic AI audit snapshots", () => {
  it.each([
    { patches: [{ enabled: false }, { enabled: true }], changes: [
      [{ fieldName: "enabled", oldValue: true, newValue: false }],
      [{ fieldName: "enabled", oldValue: false, newValue: true }]
    ], final: { enabled: true, sentimentEnabled: true } },
    { patches: [{ enabled: false }, { sentimentEnabled: false }], changes: [
      [{ fieldName: "enabled", oldValue: true, newValue: false }],
      [{ fieldName: "sentimentEnabled", oldValue: true, newValue: false }]
    ], final: { enabled: false, sentimentEnabled: false } }
  ])("attributes overlapping patches to their own successful writes: $patches", async ({ patches, changes, final }) => {
    let current = { _id: "user-1", aiSettings: { enabled: true, sentimentEnabled: true } };
    const writes: Array<() => void> = [];
    models.user.findById.mockImplementation(() => ({ lean: async () => structuredClone(current) }));
    models.user.findByIdAndUpdate.mockImplementation((id, update, options) => ({ lean: () => new Promise((resolve) => {
      expect(id).toBe("user-1");
      writes.push(() => {
        const before = structuredClone(current);
        const settings = Object.fromEntries(Object.entries(update.$set).map(([key, value]) => [key.replace("aiSettings.", ""), value]));
        current = { ...current, aiSettings: { ...current.aiSettings, ...settings } };
        resolve(structuredClone(options.new === true || options.returnDocument === "after" ? current : before));
      });
    }) }));

    const pending = patches.map((patch) => updateAiSettings("user-1", patch));
    await vi.waitFor(() => expect(writes).toHaveLength(2));
    writes[0]!();
    writes[1]!();
    const results = await Promise.all(pending);

    expect(current.aiSettings).toEqual(final);
    expect(results[0]).toMatchObject({ enabled: false, sentimentEnabled: true });
    expect(results[1]).toMatchObject(final);
    expect(histories().map((entry) => entry.changes)).toEqual(changes);
  });

  it("does not record an update when the user no longer exists", async () => {
    models.user.findById.mockReturnValue({ lean: async () => ({ _id: "user-1" }) });
    models.user.findByIdAndUpdate.mockReturnValue({ lean: async () => null });
    await expect(updateAiSettings("user-1", { enabled: false })).rejects.toMatchObject({ code: "USER_NOT_FOUND" });
    expect(histories()).toEqual([]);
  });
});

describe("atomic Facebook audit snapshots", () => {
  it.each([
    { field: "pageName" as const, value: "Renamed Page" },
    { field: "status" as const, value: "invalid" }
  ])("retries when $field changes between the snapshot and the conditional write", async ({ field, value }) => {
    const store = pageStore(page());
    const writeReady = deferred<void>();
    const releaseWrite = deferred<void>();
    const update = store.model.findOneAndUpdate.getMockImplementation()!;
    store.model.findOneAndUpdate.mockImplementationOnce(async (...args) => {
      writeReady.resolve(); await releaseWrite.promise; return update(...args);
    });
    const pending = connect(pageService(store.model), "page-b");
    await writeReady.promise;
    await update({ userId: "user-1" }, { $set: { [field]: value } }, { new: true });
    releaseWrite.resolve();
    await pending;

    expect(store.current()?.pageId).toBe("page-b");
    expect(histories()).toHaveLength(1);
    expect(histories()[0].changes).toContainEqual({
      fieldName: field, oldValue: value, newValue: field === "pageName" ? "page-b" : "connected"
    });
  });

  it("retries a replacement as an insert when disconnect wins the conditional write", async () => {
    const store = pageStore(page());
    const writeReady = deferred<void>();
    const releaseWrite = deferred<void>();
    const update = store.model.findOneAndUpdate.getMockImplementation()!;
    store.model.findOneAndUpdate.mockImplementationOnce(async (...args) => {
      writeReady.resolve(); await releaseWrite.promise; return update(...args);
    });
    const service = pageService(store.model);
    const pending = connect(service, "page-b");
    await writeReady.promise;
    await service.remove("user-1");
    releaseWrite.resolve();
    const saved = await pending;

    expect(saved.pageId).toBe("page-b");
    expect(saved.id).not.toBe("connection-1");
    expect(histories().map((entry) => entry.changes[0])).toEqual([
      { fieldName: "pageId", oldValue: "page-a", newValue: "(không có)" },
      { fieldName: "pageId", oldValue: "(không có)", newValue: "page-b" }
    ]);
  });

  it.each([
    new Error("storage unavailable"),
    { code: 11000, keyPattern: { _id: 1 } }
  ])("propagates unrelated insert errors without retrying or recording", async (failure) => {
    const store = pageStore(null);
    store.model.create.mockRejectedValueOnce(failure);
    await expect(connect(pageService(store.model), "page-b")).rejects.toBe(failure);
    expect(store.current()).toBeNull();
    expect(histories()).toEqual([]);
  });

  it("does not remove or audit another user's connection", async () => {
    const store = pageStore(page());
    await pageService(store.model).remove("user-2");
    expect(store.current()?.pageId).toBe("page-a");
    expect(histories()).toEqual([]);
  });

  it("keeps disconnect successful when the real recorder cannot persist history", async () => {
    const store = pageStore(page());
    models.history.create.mockRejectedValueOnce(new Error("history unavailable"));
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await expect(pageService(store.model).remove("user-1")).resolves.toBeUndefined();
      expect(store.current()).toBeNull();
      await vi.waitFor(() => expect(errorLog).toHaveBeenCalledWith(
        "Failed to record setting history", expect.objectContaining({ actionType: "DISCONNECT_FACEBOOK_PAGE" })
      ));
    } finally {
      errorLog.mockRestore();
    }
  });

  it.each([page(), null])("records consecutive replacements from %j", async (initial) => {
    const store = pageStore(initial);
    const service = pageService(store.model);
    const first = await connect(service, "page-b");
    const second = await connect(service, "page-c");

    expect([first.pageId, second.pageId, store.current()?.pageId]).toEqual(["page-b", "page-c", "page-c"]);
    expect(histories().map((entry) => entry.changes.find((change: { fieldName: string }) => change.fieldName === "pageId")))
      .toEqual([
        { fieldName: "pageId", oldValue: initial ? "page-a" : "(không có)", newValue: "page-b" },
        { fieldName: "pageId", oldValue: "page-b", newValue: "page-c" }
      ]);
    expect(JSON.stringify(histories())).not.toMatch(/ciphertext|test-secret|old-secret/);
  });

  it("uses the Page replaced after a slow Graph validation", async () => {
    const store = pageStore(page());
    const validation = deferred<Response>();
    const started = deferred<void>();
    const service = pageService(store.model, async (url) => {
      if (url.includes("/page-c?")) { started.resolve(); return validation.promise; }
      return graphResponse("page-b");
    });
    const slow = connect(service, "page-c");
    await started.promise;
    await connect(service, "page-b");
    validation.resolve(graphResponse("page-c"));
    await slow;

    expect(histories().map((entry) => entry.changes[0])).toEqual([
      { fieldName: "pageId", oldValue: "page-a", newValue: "page-b" },
      { fieldName: "pageId", oldValue: "page-b", newValue: "page-c" }
    ]);
  });

  it("records exactly one deletion for repeated disconnects", async () => {
    const store = pageStore(page());
    const service = pageService(store.model);
    await service.remove("user-1");
    await service.remove("user-1");

    expect(store.current()).toBeNull();
    expect(histories()).toHaveLength(1);
    expect(histories()[0]).toMatchObject({ actionType: "DISCONNECT_FACEBOOK_PAGE", changes: [
      { fieldName: "pageId", oldValue: "page-a", newValue: "(không có)" },
      { fieldName: "pageName", oldValue: "page-a", newValue: "(không có)" },
      { fieldName: "status", oldValue: "connected", newValue: "(không có)" }
    ] });
  });

  it("records the original Page when a replacement attempts to race removal", async () => {
    const store = pageStore(page());
    const deletionReady = deferred<void>();
    const releaseDeletion = deferred<void>();
    const deleteOne = store.model.deleteOne.getMockImplementation()!;
    const findOneAndDelete = store.model.findOneAndDelete.getMockImplementation()!;
    store.model.deleteOne.mockImplementation(async (filter) => {
      deletionReady.resolve(); await releaseDeletion.promise; return deleteOne(filter);
    });
    store.model.findOneAndDelete.mockImplementation(async (filter) => {
      deletionReady.resolve(); await releaseDeletion.promise; return findOneAndDelete(filter);
    });
    const service = pageService(store.model);
    const removal = service.remove("user-1");
    await deletionReady.promise;
    await expect(connect(service, "page-b")).rejects.toMatchObject({ code: "FACEBOOK_PAGE_CONNECTION_BUSY" });
    releaseDeletion.resolve();
    await removal;

    expect(store.current()).toBeNull();
    expect(histories().find((entry) => entry.actionType === "DISCONNECT_FACEBOOK_PAGE")?.changes[0])
      .toEqual({ fieldName: "pageId", oldValue: "page-a", newValue: "(không có)" });
  });
});
