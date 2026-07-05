import { useCallback, useEffect, useRef, useState } from 'react';

const LAST_ACTIVE_KEY = 'cictrix_session_last_active';

export const IDLE_TIMEOUT_MS = 8 * 60 * 60 * 1000; // 8 hours
export const WARN_BEFORE_MS = 5 * 60 * 1000;       // warn 5 minutes before expiry

export function stampSessionActive(): void {
  try {
    localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()));
  } catch {
    // ignore storage errors
  }
}

export function clearSessionActive(): void {
  try {
    localStorage.removeItem(LAST_ACTIVE_KEY);
  } catch {
    // ignore
  }
}

function readLastActive(): number {
  try {
    const raw = localStorage.getItem(LAST_ACTIVE_KEY);
    if (!raw) return Date.now();
    const val = Number(raw);
    return isNaN(val) ? Date.now() : val;
  } catch {
    return Date.now();
  }
}

interface UseIdleTimeoutOptions {
  enabled: boolean;
  idleTimeoutMs?: number;
  warnBeforeMs?: number;
  onExpire: () => void;
}

export function useIdleTimeout({
  enabled,
  idleTimeoutMs = IDLE_TIMEOUT_MS,
  warnBeforeMs = WARN_BEFORE_MS,
  onExpire,
}: UseIdleTimeoutOptions) {
  const [showWarning, setShowWarning] = useState(false);

  const lastActiveRef = useRef<number>(Date.now());
  const lastWriteRef  = useRef<number>(0);
  const showWarningRef = useRef(false);
  const hasExpiredRef  = useRef(false);

  // Always call the latest closure so stale-capture is never an issue.
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  const extendSession = useCallback(() => {
    const now = Date.now();
    lastActiveRef.current  = now;
    lastWriteRef.current   = now;
    hasExpiredRef.current  = false;
    showWarningRef.current = false;
    stampSessionActive();
    setShowWarning(false);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setShowWarning(false);
      showWarningRef.current = false;
      hasExpiredRef.current  = false;
      return;
    }

    // Sync with persisted value so a reload doesn't reset the clock.
    const stored = readLastActive();
    lastActiveRef.current = stored;

    const check = () => {
      if (hasExpiredRef.current) return;
      const idle = Date.now() - lastActiveRef.current;

      if (idle >= idleTimeoutMs) {
        hasExpiredRef.current  = true;
        showWarningRef.current = false;
        setShowWarning(false);
        onExpireRef.current();
        return;
      }

      const inWarnZone = idle >= idleTimeoutMs - warnBeforeMs;
      if (inWarnZone !== showWarningRef.current) {
        showWarningRef.current = inWarnZone;
        setShowWarning(inWarnZone);
      }
    };

    const ACTIVITY_EVENTS = [
      'mousemove',
      'mousedown',
      'keydown',
      'scroll',
      'touchstart',
    ] as const;

    const handleActivity = () => {
      const now = Date.now();
      lastActiveRef.current = now; // always update in-memory immediately

      if (showWarningRef.current) {
        showWarningRef.current = false;
        setShowWarning(false);
      }

      // Throttle localStorage writes to once per 30 seconds.
      if (now - lastWriteRef.current >= 30_000) {
        stampSessionActive();
        lastWriteRef.current = now;
      }
    };

    ACTIVITY_EVENTS.forEach((ev) =>
      window.addEventListener(ev, handleActivity, { passive: true })
    );

    // When the tab regains focus, immediately re-check in case timers were
    // throttled while the browser was in the background.
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const stored = readLastActive();
        lastActiveRef.current = Math.max(lastActiveRef.current, stored);
        check();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const intervalId = window.setInterval(check, 60_000);
    check(); // immediate first check

    return () => {
      window.clearInterval(intervalId);
      ACTIVITY_EVENTS.forEach((ev) =>
        window.removeEventListener(ev, handleActivity)
      );
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, idleTimeoutMs, warnBeforeMs]);

  return { showWarning, extendSession };
}
