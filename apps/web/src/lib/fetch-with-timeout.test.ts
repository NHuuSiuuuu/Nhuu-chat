import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchJsonWithTimeout } from "./fetch-with-timeout.js";

describe("fetchJsonWithTimeout", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("aborts a request that remains pending past its deadline", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    }));

    const request = fetchJsonWithTimeout("/api/v1/auth/session", { method: "POST" }, 100);
    const rejection = expect(request).rejects.toMatchObject({ name: "TimeoutError" });
    await vi.advanceTimersByTimeAsync(100);

    await rejection;
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("keeps the deadline active while a response body is still pending", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) => Promise.resolve({
      ok: true,
      json: () => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      })
    } as Response));

    const request = fetchJsonWithTimeout("/api/v1/auth/session", { method: "POST" }, 100);
    const rejection = expect(request).rejects.toMatchObject({ name: "TimeoutError" });
    await vi.advanceTimersByTimeAsync(100);

    await rejection;
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("uses the caller abort signal when the auth bootstrap is cancelled", async () => {
    const parent = new AbortController();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    }));
    const request = fetchJsonWithTimeout("/api/v1/auth/session", { method: "POST" }, 100, parent.signal);

    parent.abort(new DOMException("Unmounted", "AbortError"));

    await expect(request).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
