import { create } from "zustand";
import { focusManager, onlineManager } from "@tanstack/react-query";
import { useAuthStore } from "./authStore";

/**
 * W6-05: idle auto-lock. The lock flag is persisted, so a reload or an app restart while locked
 * comes back locked; the idle minutes are a per-workstation setting (this machine's localStorage only).
 */
const LOCKED_KEY = "fine_screen_locked";
const IDLE_MINUTES_KEY = "fine_idle_lock_minutes";

export const DEFAULT_IDLE_LOCK_MINUTES = 15;
export const MAX_IDLE_LOCK_MINUTES = 240;

const isLocalStorageAvailable = (): boolean => {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
};

/** Whole minutes, 0 (off) to MAX_IDLE_LOCK_MINUTES; anything unreadable falls back to the default. */
export const sanitizeIdleMinutes = (value: unknown): number => {
  if (value === null || value === undefined || value === "") return DEFAULT_IDLE_LOCK_MINUTES;
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < 0) return DEFAULT_IDLE_LOCK_MINUTES;
  return Math.min(MAX_IDLE_LOCK_MINUTES, n);
};

const readLocked = (): boolean => {
  if (!isLocalStorageAvailable()) return false;
  try {
    return localStorage.getItem(LOCKED_KEY) === "1";
  } catch {
    return false;
  }
};

const writeLocked = (locked: boolean) => {
  if (!isLocalStorageAvailable()) return;
  try {
    if (locked) localStorage.setItem(LOCKED_KEY, "1");
    else localStorage.removeItem(LOCKED_KEY);
  } catch (e) {
    console.error("Failed to save the lock state to localStorage:", e);
  }
};

const readIdleMinutes = (): number => {
  if (!isLocalStorageAvailable()) return DEFAULT_IDLE_LOCK_MINUTES;
  try {
    return sanitizeIdleMinutes(localStorage.getItem(IDLE_MINUTES_KEY));
  } catch {
    return DEFAULT_IDLE_LOCK_MINUTES;
  }
};

interface LockState {
  locked: boolean;
  /** Minutes without mouse, keyboard or touch activity before the screen locks; 0 = never. */
  idleMinutes: number;
  lock: () => void;
  unlock: () => void;
  setIdleMinutes: (minutes: number) => void;
}

// A lock only means something for a signed-in session.
const initialLocked = readLocked() && useAuthStore.getState().isAuthenticated;
if (!initialLocked) writeLocked(false);

export const useLockStore = create<LockState>((set, get) => ({
  locked: initialLocked,
  idleMinutes: readIdleMinutes(),

  lock: () => {
    if (get().locked || !useAuthStore.getState().isAuthenticated) return;
    writeLocked(true);
    set({ locked: true });
  },

  unlock: () => {
    if (!get().locked) return;
    writeLocked(false);
    set({ locked: false });
  },

  setIdleMinutes: (minutes: number) => {
    const next = sanitizeIdleMinutes(minutes);
    if (isLocalStorageAvailable()) {
      try {
        localStorage.setItem(IDLE_MINUTES_KEY, String(next));
      } catch (e) {
        console.error("Failed to save the idle lock minutes to localStorage:", e);
      }
    }
    set({ idleMinutes: next });
  },
}));

/**
 * While locked, TanStack Query makes no requests: the focus manager reports "unfocused" (no
 * interval or focus refetches) and the online manager reports "offline" (any other query fetch,
 * such as a mount after a reload while locked, waits). Both resume on unlock and refresh stale data.
 * Requests sent outside TanStack Query (verify-password, logout) are unaffected; the one background
 * poll outside it (ServerConnectionBanner's reconnect check) stops on its own while locked.
 */
/**
 * The connection state the browser last reported. TanStack Query starts out online and follows the
 * browser's online/offline events; unlocking restores that state instead of forcing "online", so a
 * real outage that began behind the lock screen keeps the queries paused.
 */
let browserOnline = true;

const applyQueryPause = (locked: boolean) => {
  focusManager.setFocused(locked ? false : undefined);
  onlineManager.setOnline(!locked && browserOnline);
};

// The browser's own online event must not resume queries behind the lock screen.
onlineManager.setEventListener((setOnline) => {
  if (typeof window === "undefined" || !window.addEventListener) return undefined;
  const onOnline = () => {
    browserOnline = true;
    setOnline(!useLockStore.getState().locked);
  };
  const onOffline = () => {
    browserOnline = false;
    setOnline(false);
  };
  window.addEventListener("online", onOnline, false);
  window.addEventListener("offline", onOffline, false);
  return () => {
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
  };
});

if (initialLocked) applyQueryPause(true);

useLockStore.subscribe((state, previous) => {
  if (state.locked === previous.locked) return;
  if (!state.locked && !useAuthStore.getState().isAuthenticated) {
    // Unlocked by a logout: resume after the logout has cleared the query cache, so the queries of
    // the signed-out session are not sent again without a token.
    window.setTimeout(() => {
      if (!useLockStore.getState().locked) applyQueryPause(false);
    }, 0);
    return;
  }
  applyQueryPause(state.locked);
});

// Any logout (the switch-user button, a 401 from the API, a logout elsewhere) ends the lock.
useAuthStore.subscribe((state) => {
  if (!state.isAuthenticated) useLockStore.getState().unlock();
});

/**
 * The OS locked the screen or the machine suspended (Electron main, through the preload bridge).
 * Subscribed here, for the whole life of the renderer rather than only on signed-in routes, and
 * paired with takePendingLock: main keeps the event until a renderer collects it, so a lock sent
 * while no window was open (macOS) or before this module loaded is applied on the next load.
 * Collecting it on the login screen just drops it; lock() is a no-op without a session.
 */
const electronBridge = typeof window !== "undefined" ? window.electronAPI : undefined;
if (electronBridge?.onLockScreen) {
  electronBridge.onLockScreen(() => {
    useLockStore.getState().lock();
    void electronBridge.takePendingLock?.().catch((): void => undefined);
  });
  void electronBridge
    .takePendingLock?.()
    .then((pending) => {
      if (pending) useLockStore.getState().lock();
    })
    .catch((): void => undefined);
}
