import { useEffect } from "react";
import { useLockStore } from "../stores/lockStore";

/** Mouse, keyboard and touch input that counts as the user being at the workstation. */
const ACTIVITY_EVENTS = ["mousemove", "mousedown", "wheel", "keydown", "touchstart", "touchmove"] as const;

const CHECK_EVERY_MS = 5_000;

/**
 * W6-05: locks the screen after this workstation's idle minutes without activity (0 = never).
 * Mount once, for every signed-in route (ProtectedRoute does). The OS lock/suspend event from
 * Electron main is handled in lockStore itself, so it is never missed while this is unmounted.
 */
export const useIdleLock = (): void => {
  const locked = useLockStore((state) => state.locked);
  const idleMinutes = useLockStore((state) => state.idleMinutes);
  const lock = useLockStore((state) => state.lock);

  useEffect(() => {
    if (locked || idleMinutes <= 0) return;

    const idleMs = idleMinutes * 60_000;
    let lastActivity = Date.now();
    const markActive = () => {
      lastActivity = Date.now();
    };

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, markActive, { capture: true, passive: true });
    }
    // Compared against the clock, so a throttled background timer or a sleep still locks on time.
    const timer = window.setInterval(() => {
      if (Date.now() - lastActivity >= idleMs) lock();
    }, CHECK_EVERY_MS);

    return () => {
      window.clearInterval(timer);
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, markActive, { capture: true });
      }
    };
  }, [locked, idleMinutes, lock]);
};
