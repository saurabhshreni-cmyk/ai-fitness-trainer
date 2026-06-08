import { useEffect, useRef, useState } from "react";
import { checkBackend, flushQueue } from "../utils/api";

// Render's free tier spins a service down after ~15 min of inactivity, and the
// cold start can take 30–60s. We ping just under that window to keep the dyno
// warm during an active session, and aggressively re-probe while it wakes.
const KEEPALIVE_MS = 14 * 60 * 1000; // 14 min — under Render's idle window
const RETRY_MS = 30 * 1000;          // re-probe every 30s while waking/offline
const WAKING_ATTEMPTS = 4;           // show "waking up" for the first ~2 min

/**
 * Tracks backend reachability and keeps the Render free-tier service awake.
 *
 * Returns one of: "checking" | "online" | "waking" | "offline".
 *  - checking: first probe in flight (initial mount)
 *  - online:   reachable; a keep-alive ping is scheduled every 14 min
 *  - waking:   unreachable but recently so — likely a cold Render dyno
 *  - offline:  unreachable after several attempts; still retrying every 30s
 *
 * On every successful (re)connection the offline queue is flushed.
 */
export default function useBackendStatus() {
  const [status, setStatus] = useState("checking");
  const attemptsRef = useRef(0);
  const timerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const clearTimer = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const schedule = (ms, fn) => {
      clearTimer();
      timerRef.current = setTimeout(() => {
        if (!cancelled) fn();
      }, ms);
    };

    const probe = async () => {
      const ok = await checkBackend();
      if (cancelled) return;

      if (ok) {
        attemptsRef.current = 0;
        setStatus("online");
        flushQueue().catch(() => {});
        schedule(KEEPALIVE_MS, probe); // keep the dyno warm
      } else {
        attemptsRef.current += 1;
        setStatus(attemptsRef.current <= WAKING_ATTEMPTS ? "waking" : "offline");
        schedule(RETRY_MS, probe); // retry until it responds
      }
    };

    probe();

    // Re-probe immediately when the tab regains focus so a returning user
    // isn't left staring at a stale "offline" badge.
    const onVisible = () => {
      if (document.visibilityState === "visible" && !cancelled) probe();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearTimer();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return status;
}
