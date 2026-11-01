import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, Download, Loader2, Lock, LogOut } from "lucide-react";
import { PasswordInput } from "../ui/PasswordInput";
import { useLockStore } from "../../stores/lockStore";
import { useAuthStore } from "../../stores/authStore";
import { useVerifyPasswordMutation } from "../../hooks/useAuthQuery";
import { apiErrorPayload } from "../../api/endpoints/production";
import { useUpdateRequiredStore } from "../../stores/updateRequiredStore";

/** Keyboard and pointer events never travel past the lock screen to the app's own listeners. */
const ISOLATED_EVENTS = ["keydown", "keyup", "keypress", "mousedown", "pointerdown"] as const;
const KEY_EVENTS = ["keydown", "keyup", "keypress"] as const;

/** Above every dialog, toast, dropdown and the build HUD (z-[999999]). */
const LOCK_Z_INDEX = 1_000_000;

interface LockScreenProps {
  /** "تبديل المستخدم": signs this user out and returns to the login screen. */
  onSwitchUser: () => void;
  isSwitchingUser?: boolean;
}

/** W6-05: the idle lock overlay; renders nothing while unlocked. */
export const LockScreen: React.FC<LockScreenProps> = (props) => {
  const locked = useLockStore((state) => state.locked);
  if (!locked) return null;
  return <LockScreenOverlay {...props} />;
};

const LockScreenOverlay: React.FC<LockScreenProps> = ({ onSwitchUser, isSwitchingUser = false }) => {
  const user = useAuthStore((state) => state.user);
  const updateInfo = useUpdateRequiredStore((state) => state.info);
  const verifyMutation = useVerifyPasswordMutation();
  const [host] = useState(() => document.createElement("div"));
  const inputRef = useRef<HTMLInputElement>(null);

  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [retryUntil, setRetryUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const secondsLeft = retryUntil ? Math.max(0, Math.ceil((retryUntil - now) / 1000)) : 0;

  // The overlay lives in its own node at the end of <body>; everything else becomes inert, so
  // Tab cannot reach a field or button of the app behind it.
  useLayoutEffect(() => {
    host.setAttribute("dir", "rtl");
    host.setAttribute("lang", "ar");
    document.body.appendChild(host);

    const madeInert: HTMLElement[] = [];
    for (const child of Array.from(document.body.children)) {
      if (child !== host && child instanceof HTMLElement && !child.inert) {
        child.inert = true;
        madeInert.push(child);
      }
    }

    // A key pressed outside the overlay (focus on <body>, a barcode scanner) is swallowed.
    const blockOutside = (event: Event) => {
      if (event.target instanceof Node && host.contains(event.target)) return;
      event.stopImmediatePropagation();
      event.preventDefault();
      inputRef.current?.focus();
    };
    // Events inside the overlay reach React (its listener on this node runs first), then stop here.
    const stopHere = (event: Event) => event.stopPropagation();

    for (const type of KEY_EVENTS) window.addEventListener(type, blockOutside, true);
    for (const type of ISOLATED_EVENTS) host.addEventListener(type, stopHere);

    return () => {
      for (const type of KEY_EVENTS) window.removeEventListener(type, blockOutside, true);
      for (const type of ISOLATED_EVENTS) host.removeEventListener(type, stopHere);
      for (const el of madeInert) el.inert = false;
      host.remove();
    };
  }, [host]);

  // Focus the password field on open and again once each check has settled (it is disabled meanwhile).
  useEffect(() => {
    if (!verifyMutation.isPending) inputRef.current?.focus();
  }, [verifyMutation.isPending]);

  // The throttle countdown: ticks once a second until the server's retry window has passed.
  useEffect(() => {
    if (retryUntil === null) return;
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= retryUntil) {
        setRetryUntil(null);
        inputRef.current?.focus();
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [retryUntil]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (verifyMutation.isPending || secondsLeft > 0) return;
    if (!password) {
      setError("أدخل كلمة المرور.");
      inputRef.current?.focus();
      return;
    }
    setError(null);
    verifyMutation.mutate(password, {
      onSuccess: () => {
        setPassword("");
      },
      onError: (err) => {
        setPassword("");
        const payload = apiErrorPayload(err) as { code?: string; retry_after?: number } | undefined;
        const status = err.response?.status;
        if (status === 429 || payload?.code === "PASSWORD_VERIFY_THROTTLED") {
          const fromBody = Number(payload?.retry_after);
          const fromHeader = Number(err.response?.headers?.["retry-after"]);
          const seconds = fromBody > 0 ? fromBody : fromHeader > 0 ? fromHeader : 60;
          const current = Date.now();
          setNow(current);
          setRetryUntil(current + seconds * 1000);
          setError(null);
          return;
        }
        // A forced update: the server's 426 FORCE_UPDATE_REQUIRED (the response interceptor has
        // just stored it), or the API client refusing the request because one is already pending.
        const forcedUpdate = useUpdateRequiredStore.getState().info;
        if (payload?.code === "PASSWORD_INVALID") {
          setError("كلمة المرور غير صحيحة.");
        } else if (payload?.code === "ACCOUNT_DEACTIVATED") {
          setError("تم تعطيل هذا الحساب — اختر «تبديل المستخدم» لتسجيل الدخول بحساب آخر.");
        } else if (forcedUpdate) {
          setError(forcedUpdate.message_ar);
        } else if (status === 426 || payload?.code === "FORCE_UPDATE_REQUIRED") {
          setError("يتطلب النظام تحديث التطبيق إلى أحدث إصدار قبل المتابعة.");
        } else if (!err.response) {
          setError("تعذّر التحقق من كلمة المرور. تحقق من الاتصال بالخادم ثم أعد المحاولة.");
        } else {
          // verify-password has no other coded refusal; the backend's own message text is English.
          setError("تعذّر التحقق من كلمة المرور. أعد المحاولة بعد قليل.");
        }
      },
    });
  };

  const message =
    secondsLeft > 0
      ? `محاولات خاطئة كثيرة. أعد المحاولة بعد ${secondsLeft} ثانية.`
      : (error ?? updateInfo?.message_ar ?? null);
  const isBusy = verifyMutation.isPending || isSwitchingUser;

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center bg-app-bg-secondary p-4"
      style={{ zIndex: LOCK_Z_INDEX }}
      dir="rtl"
      lang="ar"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lock-screen-title"
      onMouseDown={(e) => {
        // Clicking the empty backdrop keeps the focus in the password field.
        if (e.target === e.currentTarget) e.preventDefault();
      }}
    >
      <div className="w-full max-w-sm rounded-2xl border border-app-separator bg-app-bg-primary p-6 shadow-lg">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-app-accent/10">
            <Lock className="h-6 w-6 text-app-accent" />
          </div>
          <h1 id="lock-screen-title" className="mt-3 text-base font-bold text-app-label-primary">
            الشاشة مقفلة
          </h1>
          <p className="mt-1 text-sm font-semibold text-app-label-primary">{user?.name ?? "—"}</p>
          <p className="mt-1 text-[11px] text-app-label-secondary">أدخل كلمة المرور للمتابعة من حيث توقفت.</p>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-3" noValidate>
          {message && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-app-lg border border-app-status-danger/30 bg-app-status-danger/10 p-3 text-[11px] font-semibold text-app-status-danger"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{message}</span>
            </div>
          )}

          <div>
            <label htmlFor="lock-screen-password" className="mb-1 block text-[11px] font-semibold text-app-label-secondary">
              كلمة المرور
            </label>
            <PasswordInput
              id="lock-screen-password"
              ref={inputRef}
              value={password}
              autoComplete="current-password"
              disabled={isBusy}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError(null);
              }}
            />
          </div>

          <button
            type="submit"
            disabled={isBusy || secondsLeft > 0 || !password}
            className="flex w-full items-center justify-center gap-2 rounded-app-lg bg-app-accent px-4 py-2.5 text-xs font-bold text-white transition-colors hover:bg-app-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {verifyMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            فتح القفل
          </button>

          {updateInfo?.update_url && (
            <button
              type="button"
              onClick={() => window.open(updateInfo.update_url, "_blank")}
              className="flex w-full items-center justify-center gap-2 rounded-app-lg border border-app-status-yellow/40 bg-app-status-yellow/10 px-4 py-2.5 text-xs font-bold text-app-label-primary transition-colors hover:bg-app-status-yellow/20"
            >
              <Download className="h-4 w-4" />
              تنزيل التحديث
            </button>
          )}

          <button
            type="button"
            onClick={onSwitchUser}
            disabled={isBusy}
            className="flex w-full items-center justify-center gap-2 rounded-app-lg border border-app-separator bg-app-bg-secondary px-4 py-2.5 text-xs font-bold text-app-label-primary transition-colors hover:bg-app-fill-f1 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSwitchingUser ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
            تبديل المستخدم
          </button>
        </form>
      </div>
    </div>,
    host,
  );
};
