import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_GREETING_DELAY_MS, waitForGreetingDelay } from "./greeting-delay.js";

describe("greeting response delay", () => {
  afterEach(() => vi.useRealTimers());

  it("waits two seconds by default before resolving", async () => {
    vi.useFakeTimers();
    let resolved = false;
    const waiting = waitForGreetingDelay().then(() => { resolved = true; });

    await vi.advanceTimersByTimeAsync(DEFAULT_GREETING_DELAY_MS - 1);
    expect(resolved).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await waiting;
    expect(resolved).toBe(true);
  });
});
