import * as React from "react";
import { useEffect, useRef, useState } from "react";
import "./NetflixIntro.css";

const DEFAULT_DURATION = 1200;
const EXIT_DURATION = 600;

interface IntroLifecycleOptions {
  duration: number;
  exitDuration: number;
  onExitStart: () => void;
  onComplete: () => void;
}

interface IntroLifecycle {
  setReady: (ready: boolean) => void;
  cancel: () => void;
}

export function createIntroLifecycle({ duration, exitDuration, onExitStart, onComplete }: IntroLifecycleOptions): IntroLifecycle {
  let isReady = false;
  let durationElapsed = false;
  let exitStarted = false;
  let cancelled = false;
  let durationTimer: ReturnType<typeof setTimeout> | undefined;
  let exitTimer: ReturnType<typeof setTimeout> | undefined;

  const startExit = () => {
    if (cancelled || exitStarted || !isReady || !durationElapsed) return;
    exitStarted = true;
    onExitStart();
    exitTimer = setTimeout(() => {
      if (!cancelled) onComplete();
    }, exitDuration);
  };

  durationTimer = setTimeout(() => {
    durationElapsed = true;
    startExit();
  }, duration);

  return {
    setReady(ready) {
      isReady = ready;
      startExit();
    },
    cancel() {
      cancelled = true;
      if (durationTimer) clearTimeout(durationTimer);
      if (exitTimer) clearTimeout(exitTimer);
    }
  };
}

export function NetflixIntro({ onComplete, duration = DEFAULT_DURATION, ready = true }: { onComplete: () => void; duration?: number; ready?: boolean }) {
  const [isExiting, setIsExiting] = useState(false);
  const onCompleteRef = useRef(onComplete);
  const lifecycleRef = useRef<IntroLifecycle | null>(null);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    const lifecycle = createIntroLifecycle({
      duration,
      exitDuration: EXIT_DURATION,
      onExitStart: () => setIsExiting(true),
      onComplete: () => onCompleteRef.current()
    });
    lifecycleRef.current = lifecycle;
    lifecycle.setReady(ready);
    return () => {
      lifecycle.cancel();
      lifecycleRef.current = null;
    };
  }, [duration]);

  useEffect(() => {
    lifecycleRef.current?.setReady(ready);
  }, [ready]);

  return <div className={`nhuu-intro${isExiting ? " nhuu-intro--exiting" : ""}`} aria-label="Đang khởi động NHuuChat" role="status">
    <div className="nhuu-intro__glow" aria-hidden="true" />
    <div className="nhuu-intro__content">
      <img className="nhuu-intro__brand" src="/nhuu-logo-loading.svg" alt="NhuuChat" />
      <div className="nhuu-intro__tagline">Quản lý chat đa kênh thông minh</div>
    </div>
  </div>;
}
