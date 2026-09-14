import type { QuickReplyContract } from "@nhuu-chat/contracts";
import { describe, expect, it, vi } from "vitest";
import * as settings from "./SettingsPage.js";

const oldReply = { id: "reply-1", shortcut: "hello", message: "Old" };
const savedReply = { ...oldReply, message: "Saved" };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function setup() {
  expect(settings.createQuickReplySync).toBeTypeOf("function");
  let replies: QuickReplyContract[] = [oldReply];
  const loading = vi.fn();
  const error = vi.fn();
  const sync = settings.createQuickReplySync({
    setReplies: (next) => { replies = next; },
    setLoading: loading,
    setLoadError: error
  });
  return { sync, loading, error, replies: () => replies, apply: (next: QuickReplyContract[]) => { replies = next; } };
}

describe("Settings quick reply request ordering", () => {
  it.each(["save", "delete"])("ignores a GET predating a successful %s and reconciles after the write", async (operation) => {
    const state = setup();
    const stale = deferred<QuickReplyContract[]>();
    const fresh = deferred<QuickReplyContract[]>();
    const next = operation === "save" ? [savedReply] : [];
    const reconciliation = vi.fn(() => fresh.promise);
    const loading = state.sync.load(() => stale.promise);
    await state.sync.mutate(async () => next, state.apply, reconciliation);
    expect(state.replies()).toEqual(next);
    expect(reconciliation).toHaveBeenCalledOnce();
    stale.resolve([oldReply]);
    await loading;
    expect(state.replies()).toEqual(next);
    const serverReplies = [...next, { id: "reply-2", shortcut: "server", message: "Another reply" }];
    fresh.resolve(serverReplies);
    await fresh.promise;
    expect(state.replies()).toEqual(serverReplies);
  });

  it("ignores stale GET errors and completion flags while a newer load is pending", async () => {
    const state = setup();
    const stale = deferred<QuickReplyContract[]>();
    const fresh = deferred<QuickReplyContract[]>();
    const first = state.sync.load(() => stale.promise);
    const second = state.sync.load(() => fresh.promise);
    state.error.mockClear();
    state.loading.mockClear();
    stale.reject(new Error("Old request failed"));
    await first;
    expect(state.error).not.toHaveBeenCalled();
    expect(state.loading).not.toHaveBeenCalled();
    fresh.resolve([savedReply]);
    await second;
    expect(state.replies()).toEqual([savedReply]);
    expect(state.loading).toHaveBeenLastCalledWith(false);
  });

  it("waits for overlapping writes before reconciling and suppresses GETs during them", async () => {
    const state = setup();
    const first = deferred<QuickReplyContract[]>();
    const second = deferred<QuickReplyContract[]>();
    const fetchReplies = vi.fn(async () => [savedReply]);
    const save = state.sync.mutate(() => first.promise, state.apply, fetchReplies);
    const remove = state.sync.mutate(() => second.promise, state.apply, fetchReplies);
    await state.sync.load(fetchReplies);
    first.resolve([savedReply]);
    await save;
    expect(fetchReplies).not.toHaveBeenCalled();
    second.resolve([]);
    await remove;
    expect(fetchReplies).toHaveBeenCalledOnce();
  });

  it("keeps a successful write visible if reconciliation fails", async () => {
    const state = setup();
    const fresh = deferred<QuickReplyContract[]>();
    await state.sync.mutate(async () => [savedReply], state.apply, () => fresh.promise);
    fresh.reject(new Error("Offline"));
    await fresh.promise.catch(() => undefined);
    expect(state.replies()).toEqual([savedReply]);
    expect(state.error).toHaveBeenLastCalledWith("Không thể tải danh sách trả lời nhanh", true);
  });

  it("propagates write failures and reconciles to recover an invalidated initial GET", async () => {
    const state = setup();
    const failure = new Error("Save failed");
    const fetchReplies = vi.fn(async () => [oldReply]);
    await expect(state.sync.mutate(async () => { throw failure; }, state.apply, fetchReplies)).rejects.toBe(failure);
    expect(fetchReplies).toHaveBeenCalledOnce();
    expect(state.replies()).toEqual([oldReply]);
  });

  it("invalidates pending work on cleanup or an auth change", async () => {
    const state = setup();
    const stale = deferred<QuickReplyContract[]>();
    const write = deferred<QuickReplyContract[]>();
    const fetchReplies = vi.fn(async () => [oldReply]);
    const loading = state.sync.load(() => stale.promise);
    const saving = state.sync.mutate(() => write.promise, state.apply, fetchReplies);
    state.sync.invalidate();
    stale.resolve([savedReply]);
    write.resolve([savedReply]);
    await Promise.all([loading, saving]);
    expect(state.replies()).toEqual([oldReply]);
    expect(fetchReplies).not.toHaveBeenCalled();
  });
});
