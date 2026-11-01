import React, { useCallback, useEffect, useState } from "react";
import { Archive, Info, Lock, Printer, RefreshCw } from "lucide-react";
import { DrawerMode, isDrawerConfigured, usePrintSettingsStore } from "../../stores/printSettingsStore";
import {
  canOpenCashDrawer,
  canSellAtPos,
  isDesktopPrintingAvailable,
  kickDrawer,
  printReceipt,
} from "../../lib/printing";
import { usePermissions } from "../../hooks/usePermissions";
import { useActivePosShift } from "../../hooks/useSales";
import { toast } from "../../stores/toastStore";
import { formatDateTime } from "../../lib/utils/format";
import { ReceiptCompanyHeader } from "../../components/print/ReceiptCompanyHeader";
import { MAX_IDLE_LOCK_MINUTES, useLockStore } from "../../stores/lockStore";

const inputClass =
  "w-full px-3 py-2 border border-app-separator rounded-lg bg-app-bg-secondary text-xs focus:border-app-accent focus:outline-none disabled:opacity-50";

const labelClass = "block text-[11px] font-semibold text-app-label-secondary mb-1";

interface SwitchRowProps {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}

const SwitchRow: React.FC<SwitchRowProps> = ({ label, hint, checked, disabled, onChange }) => (
  <div className="flex items-start justify-between gap-4">
    <div>
      <div className="text-xs font-semibold text-app-label-primary">{label}</div>
      {hint && <p className="text-[11px] text-app-label-secondary mt-0.5 leading-relaxed">{hint}</p>}
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
        checked ? "bg-app-accent" : "bg-app-fill-f1 border border-app-separator"
      }`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
          checked ? "start-[18px]" : "start-0.5"
        }`}
      />
    </button>
  </div>
);

/** A TCP port typed as text: 1–65535, digits only; null for anything else. */
const parsePort = (value: string): number | null => {
  const trimmed = value.trim();
  if (!/^\d{1,5}$/.test(trimmed)) return null;
  const port = Number(trimmed);
  return port >= 1 && port <= 65535 ? port : null;
};

/** Idle minutes typed as text: a whole number 0–MAX_IDLE_LOCK_MINUTES; null for anything else. */
const parseIdleMinutes = (value: string): number | null => {
  const trimmed = value.trim();
  if (!/^\d{1,3}$/.test(trimmed)) return null;
  const minutes = Number(trimmed);
  return minutes <= MAX_IDLE_LOCK_MINUTES ? minutes : null;
};

/** Per-workstation receipt printer, cash drawer and idle-lock setup (stored on this machine only). */
export const PrintSettingsPage: React.FC = () => {
  const settings = usePrintSettingsStore();
  const { updateSettings } = settings;
  const isDesktop = isDesktopPrintingAvailable();
  const { hasRole, permissions } = usePermissions();
  const { enabled: shiftsEnabled, ownShift, isLoading: isShiftLoading, isUnitLoading } = useActivePosShift();
  // The test kick is a real no-sale drawer open: the POS rule applies (outside the POS no shift is
  // joined, so only the user's own open shift counts). Held back while the shift state loads.
  const mayOpenDrawer =
    !isShiftLoading &&
    !isUnitLoading &&
    canOpenCashDrawer({
      canSell: canSellAtPos(hasRole, permissions),
      shiftsEnabled,
      hasOpenShift: Boolean(ownShift),
    });

  const [printers, setPrinters] = useState<ElectronPrinterInfo[]>([]);
  const [isLoadingPrinters, setIsLoadingPrinters] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isKicking, setIsKicking] = useState(false);
  const [testPrintedAt, setTestPrintedAt] = useState<Date>(() => new Date());
  // W6-02: the test receipt carries the company name from the profile, like the real receipts.
  /** The port as typed: committed only once it is a valid port, so the field can be cleared and retyped. */
  const [portDraft, setPortDraft] = useState(() => String(settings.drawerPort));
  const isPortDraftValid = parsePort(portDraft) !== null;
  // W6-05: idle auto-lock minutes for this workstation (0 = off).
  const idleMinutes = useLockStore((state) => state.idleMinutes);
  // Only the owner or an admin changes the lock on a workstation, so a cashier cannot switch it off.
  const canEditIdleLock = hasRole(["owner", "admin"]);
  const setIdleMinutes = useLockStore((state) => state.setIdleMinutes);
  const [idleDraft, setIdleDraft] = useState(() => String(idleMinutes));
  const isIdleDraftValid = parseIdleMinutes(idleDraft) !== null;

  const handleIdleChange = (value: string) => {
    setIdleDraft(value);
    const minutes = parseIdleMinutes(value);
    if (minutes !== null) setIdleMinutes(minutes);
  };

  const handlePortChange = (value: string) => {
    setPortDraft(value);
    const port = parsePort(value);
    if (port !== null) updateSettings({ drawerPort: port });
  };

  const loadPrinters = useCallback(async () => {
    const bridge = window.electronAPI?.printing;
    if (!bridge) return;
    setIsLoadingPrinters(true);
    try {
      setPrinters(await bridge.listPrinters());
    } catch (e) {
      toast.error(`تعذر جلب قائمة الطابعات: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIsLoadingPrinters(false);
    }
  }, []);

  useEffect(() => {
    void loadPrinters();
  }, [loadPrinters]);

  const savedPrinterMissing =
    Boolean(settings.receiptPrinter) && !printers.some((p) => p.name === settings.receiptPrinter);

  const handleTestPrint = async () => {
    setTestPrintedAt(new Date());
    setIsPrinting(true);
    try {
      // Let the timestamp render into the hidden test receipt before printing it.
      await new Promise((resolve) => window.setTimeout(resolve, 50));
      const result = await printReceipt({ copies: 1 });
      if (!result.ok) toast.error(result.message);
    } finally {
      setIsPrinting(false);
    }
  };

  const handleTestDrawer = async () => {
    if (!mayOpenDrawer) return;
    setIsKicking(true);
    try {
      const result = await kickDrawer();
      if (result.ok) toast.success("أُرسل أمر فتح الدرج");
      else toast.error(result.message);
    } finally {
      setIsKicking(false);
    }
  };

  const drawerReady = isDrawerConfigured(settings);

  return (
    <div className="space-y-6 p-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-app-label-primary flex items-center gap-2">
          <Printer className="w-7 h-7 text-app-accent" />
          إعدادات الطباعة
        </h1>
        <p className="text-xs text-app-label-secondary mt-1">
          طابعة الإيصالات الحرارية (80 مم) ودرج النقود وقفل الشاشة لهذا الجهاز — تُحفظ على هذا الجهاز فقط.
        </p>
      </div>

      {!isDesktop && (
        <div className="flex items-center gap-2 rounded-xl border border-app-status-yellow/30 bg-app-status-yellow/10 p-3 text-xs font-semibold text-app-label-primary">
          <Info className="h-4 w-4 shrink-0 text-app-status-yellow" />
          متاح في تطبيق سطح المكتب فقط
        </div>
      )}

      {/* Receipt printer */}
      <section className="rounded-2xl border border-app-separator bg-app-bg-primary p-5 space-y-4">
        <h2 className="text-sm font-bold text-app-label-primary flex items-center gap-2">
          <Printer className="h-4 w-4 text-app-accent" />
          طابعة الإيصالات
        </h2>

        <div className="grid gap-4 sm:grid-cols-[1fr_auto] items-end">
          <div>
            <label htmlFor="receipt-printer" className={labelClass}>
              الطابعة
            </label>
            <select
              id="receipt-printer"
              value={settings.receiptPrinter ?? ""}
              disabled={!isDesktop}
              onChange={(e) => updateSettings({ receiptPrinter: e.target.value || null })}
              className={inputClass}
            >
              <option value="">— بدون (نافذة الطباعة العادية) —</option>
              {printers.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.displayName}
                  {p.isDefault ? " (الافتراضية)" : ""}
                </option>
              ))}
              {savedPrinterMissing && settings.receiptPrinter && (
                <option value={settings.receiptPrinter}>{settings.receiptPrinter} (غير متصلة)</option>
              )}
            </select>
          </div>
          <button
            type="button"
            onClick={() => void loadPrinters()}
            disabled={!isDesktop || isLoadingPrinters}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-app-separator bg-app-bg-secondary px-3.5 py-2 text-xs font-semibold text-app-label-primary hover:bg-app-fill-f1 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isLoadingPrinters ? "animate-spin" : ""}`} />
            تحديث القائمة
          </button>
        </div>

        <div className="max-w-[12rem]">
          <label htmlFor="receipt-copies" className={labelClass}>
            عدد النسخ
          </label>
          <select
            id="receipt-copies"
            value={settings.receiptCopies}
            onChange={(e) => updateSettings({ receiptCopies: Number(e.target.value) })}
            className={inputClass}
          >
            {[1, 2, 3].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>

        <SwitchRow
          label="طباعة الإيصال تلقائياً بعد كل بيع"
          hint="يُطبع إيصال نقطة البيع مرة واحدة فور إتمام البيع."
          checked={settings.autoPrintReceipt}
          onChange={(next) => updateSettings({ autoPrintReceipt: next })}
        />

        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void handleTestPrint()}
            disabled={isPrinting}
            className="flex items-center gap-1.5 rounded-xl bg-app-accent px-4 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            <Printer className="h-4 w-4" />
            طباعة تجريبية
          </button>
        </div>
      </section>

      {/* Cash drawer */}
      <section className="rounded-2xl border border-app-separator bg-app-bg-primary p-5 space-y-4">
        <h2 className="text-sm font-bold text-app-label-primary flex items-center gap-2">
          <Archive className="h-4 w-4 text-app-accent" />
          درج النقود
        </h2>

        <SwitchRow
          label="فتح الدرج عند البيع النقدي"
          hint="يُفتح الدرج تلقائياً بعد كل بيع فيه دفعة نقدية."
          checked={settings.openDrawerOnCash}
          disabled={!isDesktop}
          onChange={(next) => updateSettings({ openDrawerOnCash: next })}
        />

        <div>
          <span className={labelClass}>طريقة الاتصال بالدرج</span>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { id: "printer", label: "عبر طابعة الإيصالات" },
                { id: "network", label: "طابعة شبكية (IP)" },
              ] as { id: DrawerMode; label: string }[]
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                disabled={!isDesktop}
                onClick={() => updateSettings({ drawerMode: m.id })}
                className={`rounded-xl px-4 py-2 text-xs font-bold transition-colors disabled:opacity-50 ${
                  settings.drawerMode === m.id
                    ? "bg-app-accent text-white"
                    : "border border-app-separator text-app-label-secondary hover:bg-app-fill-f1"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          {settings.drawerMode === "printer" && !settings.receiptPrinter && (
            <p className="text-[11px] text-app-label-secondary mt-1.5">اختر طابعة الإيصالات أعلاه أولاً.</p>
          )}
        </div>

        {settings.drawerMode === "network" && (
          <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
            <div>
              <label htmlFor="drawer-host" className={labelClass}>
                عنوان الطابعة (IP)
              </label>
              <input
                id="drawer-host"
                type="text"
                dir="ltr"
                placeholder="192.168.1.50"
                value={settings.drawerHost}
                disabled={!isDesktop}
                onChange={(e) => updateSettings({ drawerHost: e.target.value })}
                className={`${inputClass} font-mono`}
              />
            </div>
            <div>
              <label htmlFor="drawer-port" className={labelClass}>
                المنفذ
              </label>
              <input
                id="drawer-port"
                type="number"
                dir="ltr"
                min={1}
                max={65535}
                value={portDraft}
                disabled={!isDesktop}
                aria-invalid={!isPortDraftValid}
                aria-describedby={isPortDraftValid ? undefined : "drawer-port-error"}
                onChange={(e) => handlePortChange(e.target.value)}
                className={`${inputClass} font-mono`}
              />
              {!isPortDraftValid && (
                <p id="drawer-port-error" className="text-[11px] text-app-status-danger mt-1">
                  رقم المنفذ غير صالح
                </p>
              )}
            </div>
          </div>
        )}

        <div className="max-w-[12rem]">
          <label htmlFor="drawer-pin" className={labelClass}>
            منفذ الدرج في الطابعة
          </label>
          <select
            id="drawer-pin"
            value={settings.drawerPin}
            disabled={!isDesktop}
            onChange={(e) => updateSettings({ drawerPin: e.target.value === "1" ? 1 : 0 })}
            className={inputClass}
          >
            <option value={0}>الطرف 2 (الافتراضي)</option>
            <option value={1}>الطرف 5</option>
          </select>
        </div>

        <div className="flex items-center justify-end gap-3">
          {isDesktop && drawerReady && !mayOpenDrawer && !isShiftLoading && !isUnitLoading && (
            <p className="text-[11px] text-app-label-secondary">
              {shiftsEnabled
                ? "فتح الدرج لمن يملك صلاحية البيع وأثناء وردية مفتوحة له."
                : "فتح الدرج لمن يملك صلاحية البيع فقط."}
            </p>
          )}
          <button
            type="button"
            onClick={() => void handleTestDrawer()}
            disabled={!isDesktop || !drawerReady || !mayOpenDrawer || isKicking}
            className="flex items-center gap-1.5 rounded-xl border border-app-separator bg-app-bg-secondary px-4 py-2 text-xs font-bold text-app-label-primary hover:bg-app-fill-f1 transition-colors disabled:opacity-50"
          >
            <Archive className="h-4 w-4" />
            فتح الدرج تجريبياً
          </button>
        </div>
      </section>

      {/* W6-05: idle auto-lock */}
      <section className="rounded-2xl border border-app-separator bg-app-bg-primary p-5 space-y-4">
        <h2 className="text-sm font-bold text-app-label-primary flex items-center gap-2">
          <Lock className="h-4 w-4 text-app-accent" />
          قفل الشاشة التلقائي
        </h2>

        <div className="max-w-[12rem]">
          <label htmlFor="idle-lock-minutes" className={labelClass}>
            القفل بعد عدم النشاط (دقيقة)
          </label>
          <input
            id="idle-lock-minutes"
            type="number"
            dir="ltr"
            min={0}
            max={MAX_IDLE_LOCK_MINUTES}
            step={1}
            value={idleDraft}
            aria-invalid={!isIdleDraftValid}
            aria-describedby={isIdleDraftValid ? "idle-lock-hint" : "idle-lock-error"}
            onChange={(e) => handleIdleChange(e.target.value)}
            disabled={!canEditIdleLock}
            className={`${inputClass} font-mono disabled:opacity-60`}
          />
          {!isIdleDraftValid && (
            <p id="idle-lock-error" className="text-[11px] text-app-status-danger mt-1">
              أدخل عدداً صحيحاً من 0 إلى {MAX_IDLE_LOCK_MINUTES}
            </p>
          )}
        </div>
        <p id="idle-lock-hint" className="text-[11px] text-app-label-secondary leading-relaxed">
          {idleMinutes > 0
            ? `تُقفل الشاشة بعد ${idleMinutes} دقيقة بلا استخدام للفأرة أو لوحة المفاتيح أو اللمس، ويلزم إدخال كلمة المرور للمتابعة.`
            : "القفل التلقائي متوقف على هذا الجهاز (0 = بدون قفل)."}{" "}
          تُقفل الشاشة أيضاً عند قفل نظام التشغيل أو دخول الجهاز في وضع السكون.
          {!canEditIdleLock && " يغيّر هذا الإعداد المالك أو مدير النظام فقط."}
        </p>
      </section>

      {/* The test receipt: invisible on screen, the only thing on paper. */}
      <div className="hidden print:block">
        <div className="print-area print-thermal bg-white text-black font-mono text-xs space-y-2 p-2 text-center">
          <ReceiptCompanyHeader />
          <div className="font-sans">طباعة تجريبية — إيصال 80 مم</div>
          <div className="border-t border-dashed border-gray-400 pt-2">{formatDateTime(testPrintedAt)}</div>
          <div>{settings.receiptPrinter ?? "نافذة الطباعة العادية"}</div>
          <div className="border-t border-dashed border-gray-400 pt-2 font-sans">إذا ظهر هذا الإيصال كاملاً فالطابعة جاهزة.</div>
        </div>
      </div>
    </div>
  );
};

export default PrintSettingsPage;
