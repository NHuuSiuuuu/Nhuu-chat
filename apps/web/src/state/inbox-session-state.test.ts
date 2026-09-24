import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { inboxSessionStorageKey, pauseSocketWhenHidden, readInboxSessionState, runIntervalWhileVisible, writeInboxSessionState, type VisibilityDocumentLike } from "./inbox-session-state.js";

describe("inbox session recovery", () => {
  afterEach(() => vi.useRealTimers());
  it("scopes temporary state to both user and workspace", () => {
    expect(inboxSessionStorageKey("user 1", "workspace/2")).not.toBe(inboxSessionStorageKey("user 1", "workspace/3"));
    expect(inboxSessionStorageKey("user 1", "workspace/2")).not.toBe(inboxSessionStorageKey("user 2", "workspace/2"));
  });

  it("synchronously saves and reads drafts and scroll offsets", () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    const state = { drafts: { conversation1: "Đang soạn" }, scrollPositions: { conversation1: 412 } };
    writeInboxSessionState(storage, "session", state);
    expect(readInboxSessionState(storage, "session")).toEqual(state);
  });

  it("ignores invalid storage data instead of breaking initial render", () => {
    expect(readInboxSessionState({ getItem: () => "not-json", setItem: () => undefined }, "session")).toEqual({ drafts: {}, scrollPositions: {} });
  });

  it("disconnects while hidden and reconnects when visible, cleaning up its listener", () => {
    let listener: (() => void) | undefined;
    const doc = {
      visibilityState: "visible" as DocumentVisibilityState,
      addEventListener: vi.fn((_type: "visibilitychange", handler: () => void) => { listener = handler; }),
      removeEventListener: vi.fn((_type: "visibilitychange", handler: () => void) => { if (listener === handler) listener = undefined; })
    } satisfies VisibilityDocumentLike;
    const socket = { connect: vi.fn(), disconnect: vi.fn() };
    const onResume = vi.fn();
    const cleanup = pauseSocketWhenHidden(socket, doc, onResume);
    doc.visibilityState = "hidden";
    listener?.();
    listener?.();
    doc.visibilityState = "visible";
    listener?.();
    expect(socket.disconnect).toHaveBeenCalledTimes(1);
    expect(socket.connect).toHaveBeenCalledTimes(1);
    expect(onResume).toHaveBeenCalledTimes(1);
    cleanup();
    expect(doc.removeEventListener).toHaveBeenCalledTimes(1);
  });

  it("suspends periodic polling while hidden and cleans up its timer and listener", () => {
    vi.useFakeTimers();
    let listener: (() => void) | undefined;
    const doc = {
      visibilityState: "visible" as DocumentVisibilityState,
      addEventListener: vi.fn((_type: "visibilitychange", handler: () => void) => { listener = handler; }),
      removeEventListener: vi.fn((_type: "visibilitychange", handler: () => void) => { if (listener === handler) listener = undefined; })
    } satisfies VisibilityDocumentLike;
    const callback = vi.fn();
    const cleanup = runIntervalWhileVisible(callback, 2000, doc);

    vi.advanceTimersByTime(2000);
    doc.visibilityState = "hidden";
    listener?.();
    vi.advanceTimersByTime(4000);
    expect(callback).toHaveBeenCalledOnce();

    doc.visibilityState = "visible";
    listener?.();
    vi.advanceTimersByTime(2000);
    expect(callback).toHaveBeenCalledTimes(2);
    cleanup();
    vi.advanceTimersByTime(4000);
    expect(callback).toHaveBeenCalledTimes(2);
    expect(doc.removeEventListener).toHaveBeenCalledOnce();
  });

  it("uses visibility-aware polling for Telegram and Zalo QR sessions", () => {
    const telegram = readFileSync(new URL("../pages/TelegramPersonalPage.tsx", import.meta.url), "utf8");
    const connections = readFileSync(new URL("../components/dashboard/ConnectModal.tsx", import.meta.url), "utf8");
    expect(telegram).toContain("runIntervalWhileVisible(");
    expect(connections).toContain("runIntervalWhileVisible(");
    expect(telegram).not.toContain("window.setInterval");
    expect(connections).not.toContain("window.setInterval");
  });
});
