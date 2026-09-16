import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createIntroLifecycle } from "./NetflixIntro.js";

describe("NetflixIntro", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("defines the required visual structure and animation tokens", () => {
    const source = readFileSync(new URL("./NetflixIntro.tsx", import.meta.url), "utf8");
    const styles = readFileSync(new URL("./NetflixIntro.css", import.meta.url), "utf8");

    expect(source).toContain('./NetflixIntro.css');
    expect(source).toContain('aria-label="Đang khởi động NHuuChat"');
    expect(source).toContain('src="/nhuu-logo.svg"');
    expect(source).toContain('alt="NhuuChat"');
    expect(source).toContain("Quản lý chat đa kênh thông minh");
    expect(source).not.toContain("nhuu-intro__bar");
    expect(styles).toContain("var(--color-blue-600)");
    expect(styles).not.toContain("#e50914");
    expect(styles).not.toContain("#b20710");
    expect(styles).toContain("cubic-bezier(0.65, 0, 0.35, 1)");
    expect(styles).toContain("prefers-reduced-motion");
    expect(styles).toContain("transform: scale(1.15)");
  });

  it("waits for readiness and the minimum duration before completing after fade-out", () => {
    vi.useFakeTimers();
    const onExitStart = vi.fn();
    const onComplete = vi.fn();
    const lifecycle = createIntroLifecycle({ duration: 1200, exitDuration: 600, onExitStart, onComplete });

    lifecycle.setReady(false);
    vi.advanceTimersByTime(1200);
    expect(onExitStart).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();

    lifecycle.setReady(true);
    expect(onExitStart).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(599);
    expect(onComplete).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onComplete).toHaveBeenCalledOnce();
    lifecycle.setReady(true);
    vi.advanceTimersByTime(1000);
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("cancels pending completion when unmounted", () => {
    vi.useFakeTimers();
    const onExitStart = vi.fn();
    const onComplete = vi.fn();
    const lifecycle = createIntroLifecycle({ duration: 1200, exitDuration: 600, onExitStart, onComplete });

    lifecycle.setReady(true);
    lifecycle.cancel();
    vi.advanceTimersByTime(2000);

    expect(onExitStart).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });
});
