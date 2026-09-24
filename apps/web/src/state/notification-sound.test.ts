import { describe, expect, it, vi } from "vitest";

import { createNotificationSoundPlayer } from "./notification-sound.js";

function createFakeAudioContext(initialState: AudioContextState = "suspended") {
  const events: string[] = [];
  let state = initialState;
  const context = {
    get state() { return state; },
    currentTime: 0,
    destination: {},
    resume: vi.fn(async () => {
      events.push("resume:start");
      await Promise.resolve();
      state = "running";
      events.push("resume:done");
    }),
    createOscillator: vi.fn(() => {
      events.push(`oscillator:${state}`);
      return {
        frequency: { value: 0 },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn()
      };
    }),
    createGain: vi.fn(() => ({
      gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: vi.fn()
    }))
  };

  return { context: context as unknown as AudioContext, events };
}

describe("notification sound player", () => {
  it("waits for a suspended audio context to resume before scheduling sound", async () => {
    const { context, events } = createFakeAudioContext();
    const player = createNotificationSoundPlayer(() => context);

    await expect(player.play("default")).resolves.toBe(true);

    expect(events).toEqual(["resume:start", "resume:done", "oscillator:running"]);
    expect(context.createOscillator).toHaveBeenCalledTimes(1);
  });

  it("does not create an audio context when sound is turned off", async () => {
    const createContext = vi.fn(() => createFakeAudioContext().context);
    const player = createNotificationSoundPlayer(createContext);

    await expect(player.play("off")).resolves.toBe(false);

    expect(createContext).not.toHaveBeenCalled();
  });

  it("does not report playback when the browser refuses to resume audio", async () => {
    const { context } = createFakeAudioContext();
    vi.mocked(context.resume).mockRejectedValueOnce(new Error("autoplay blocked"));
    const player = createNotificationSoundPlayer(() => context);

    await expect(player.play("tri-tone")).resolves.toBe(false);

    expect(context.createOscillator).not.toHaveBeenCalled();
  });

  it("reuses the unlocked audio context for later notifications", async () => {
    const { context } = createFakeAudioContext();
    const player = createNotificationSoundPlayer(() => context);

    await player.unlock();
    await player.play("clubhouse");

    expect(context.resume).toHaveBeenCalledTimes(1);
    expect(context.createOscillator).toHaveBeenCalledTimes(3);
  });
});
