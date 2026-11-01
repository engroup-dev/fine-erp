import type { Sale } from "../api/endpoints/sales";
import { getPrintSettings, isDrawerConfigured } from "../stores/printSettingsStore";

/**
 * Receipt printing and cash-drawer kick. Under Electron with a receipt printer chosen the receipt
 * prints silently to it; anywhere else (no printer chosen, or the plain browser/vite page) it falls
 * back to the browser print dialog. The page's print CSS isolates `.print-area`, so printing the
 * window prints only the receipt currently on screen.
 */

/** `message` is the ready-to-toast Arabic text on failure (empty on success). */
export interface PrintOutcome {
  ok: boolean;
  error?: string;
  message: string;
}

const SUCCESS: PrintOutcome = { ok: true, message: "" };

const DESKTOP_ONLY = "متاح في تطبيق سطح المكتب فقط";

const printingBridge = () =>
  typeof window !== "undefined" ? window.electronAPI?.printing : undefined;

/** True inside the desktop app (the preload bridge exposes printing). */
export const isDesktopPrintingAvailable = (): boolean => Boolean(printingBridge());

const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

const printFailure = (error: string): PrintOutcome => ({ ok: false, error, message: `تعذر الطباعة: ${error}` });
const drawerFailure = (error: string): PrintOutcome => ({
  ok: false,
  error,
  message: `تعذر فتح درج النقود: ${error}`,
});

export interface PrintReceiptOptions {
  /** Overrides the workstation's receipt copies (e.g. 1 for a shift report or test print). */
  copies?: number;
}

/** Prints the `.print-area` on screen (80 mm). Sale receipts use the configured copies by default. */
export const printReceipt = async (options: PrintReceiptOptions = {}): Promise<PrintOutcome> => {
  const bridge = printingBridge();
  const settings = getPrintSettings();
  if (!bridge || !settings.receiptPrinter) {
    window.print();
    return SUCCESS;
  }
  try {
    const result = await bridge.printSilent({
      deviceName: settings.receiptPrinter,
      widthMicrons: 80000,
      copies: options.copies ?? settings.receiptCopies,
    });
    return result.ok ? SUCCESS : printFailure(result.error || "خطأ غير معروف");
  } catch (e) {
    return printFailure(errorText(e));
  }
};

/** Pulses the cash drawer per this workstation's settings. */
export const kickDrawer = async (): Promise<PrintOutcome> => {
  const bridge = printingBridge();
  if (!bridge) return drawerFailure(DESKTOP_ONLY);
  const settings = getPrintSettings();
  if (!isDrawerConfigured(settings)) return drawerFailure("لم يُضبط درج النقود في إعدادات الجهاز");
  try {
    const result =
      settings.drawerMode === "network"
        ? await bridge.kickDrawer({ host: settings.drawerHost, port: settings.drawerPort, pin: settings.drawerPin })
        : await bridge.kickDrawer({ printerName: settings.receiptPrinter ?? undefined, pin: settings.drawerPin });
    return result.ok ? SUCCESS : drawerFailure(result.error || "خطأ غير معروف");
  } catch (e) {
    return drawerFailure(errorText(e));
  }
};

/**
 * May this user pulse the drawer with no sale (POS "فتح الدرج", settings test)? It is a cash-control
 * event: only someone who can sell (the checkout's create-sales, owner/admin bypassing like the API),
 * and, when the unit runs shifts, only while working an open shift, exactly as a cash checkout requires.
 */
export const canSellAtPos = (hasRole: (roles: string[]) => boolean, permissions: string[]): boolean =>
  hasRole(["owner", "admin"]) || permissions.includes("*") || permissions.includes("create-sales");

export const canOpenCashDrawer = (opts: { canSell: boolean; shiftsEnabled: boolean; hasOpenShift: boolean }): boolean =>
  opts.canSell && (!opts.shiftsEnabled || opts.hasOpenShift);

/** Sales whose drawer kick already ran this session — a sale never opens the drawer twice. */
const drawerKickedSaleIds = new Set<string>();

export const saleHasCashPayment = (sale: Pick<Sale, "payment_method" | "payments">): boolean =>
  sale.payment_method === "cash" || Boolean(sale.payments?.some((p) => p.method === "cash"));

/**
 * After a completed checkout: opens the cash drawer when the sale took cash and this workstation
 * has "open on cash sales" on (desktop app, drawer configured). Runs at most once per sale id;
 * a failure is toasted by the caller via the returned outcome (null when nothing was attempted).
 */
export const kickDrawerForSale = async (
  sale: Pick<Sale, "id" | "payment_method" | "payments">,
): Promise<PrintOutcome | null> => {
  if (drawerKickedSaleIds.has(sale.id)) return null;
  const settings = getPrintSettings();
  if (!saleHasCashPayment(sale) || !settings.openDrawerOnCash) return null;
  if (!isDesktopPrintingAvailable()) return null;
  drawerKickedSaleIds.add(sale.id);
  // "Open on cash sales" is on but the drawer has no target: say so rather than silently not opening.
  if (!isDrawerConfigured(settings)) return drawerFailure("لم يُضبط درج النقود في إعدادات الجهاز");
  return kickDrawer();
};
