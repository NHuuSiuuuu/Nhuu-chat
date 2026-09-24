import type { NotificationSound } from "@nhuu-chat/contracts";

import { getNotificationSoundTones } from "./general-settings.js";

type AudioContextFactory = () => AudioContext;

/** Giữ một AudioContext được mở bởi thao tác người dùng để phát các thông báo sau đó. */
export function createNotificationSoundPlayer(createContext: AudioContextFactory) {
  let context: AudioContext | null = null;

  function getContext(): AudioContext | null {
    try {
      if (!context || context.state === "closed") context = createContext();
      return context;
    } catch {
      return null;
    }
  }

  function isRunning(audioContext: AudioContext): boolean {
    return audioContext.state === "running";
  }

  async function resumeContext(audioContext: AudioContext): Promise<boolean> {
    if (isRunning(audioContext)) return true;
    try {
      await audioContext.resume();
      return isRunning(audioContext);
    } catch {
      return false;
    }
  }

  return {
    async unlock(): Promise<boolean> {
      const audioContext = getContext();
      return audioContext ? resumeContext(audioContext) : false;
    },

    async play(sound: NotificationSound): Promise<boolean> {
      const tones = getNotificationSoundTones(sound);
      if (!tones) return false;

      const audioContext = getContext();
      if (!audioContext || !(await resumeContext(audioContext))) return false;

      try {
        let startAt = audioContext.currentTime;
        for (const tone of tones) {
          const oscillator = audioContext.createOscillator();
          const gain = audioContext.createGain();
          const endAt = startAt + tone.durationMs / 1000;
          oscillator.frequency.value = tone.frequency;
          gain.gain.setValueAtTime(0.0001, startAt);
          gain.gain.exponentialRampToValueAtTime(0.12, startAt + 0.01);
          gain.gain.exponentialRampToValueAtTime(0.0001, endAt);
          oscillator.connect(gain);
          gain.connect(audioContext.destination);
          oscillator.start(startAt);
          oscillator.stop(endAt);
          startAt = endAt + 0.07;
        }
        return true;
      } catch {
        return false;
      }
    }
  };
}

const notificationSoundPlayer = createNotificationSoundPlayer(() => {
  if (typeof AudioContext === "undefined") throw new Error("Web Audio API is not available");
  return new AudioContext();
});

export function unlockNotificationSound(): Promise<boolean> {
  return notificationSoundPlayer.unlock();
}

export function playNotificationSound(sound: NotificationSound): Promise<boolean> {
  return notificationSoundPlayer.play(sound);
}
