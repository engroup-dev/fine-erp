import React, { useState, useEffect } from "react";
import { DollarSign, Printer, CheckCircle2, AlertCircle, TrendingUp, Landmark, Banknote, FileText, Save } from "lucide-react";
import { PAYMENT_METHOD_LABEL, PosDailyReport, salesErrorMessage } from "../../api/endpoints/sales";
import { usePosDailyClose, usePosShifts, useSavePosDailyClose } from "../../hooks/useSales";
import { apiErrorPayload } from "../../api/endpoints/production";
import { toast } from "../../stores/toastStore";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose, DialogBody, DialogFooter } from "../ui/Dialog";
import { formatNumber } from "../../lib/utils/format";
import { ReceiptCompanyHeader } from "../print/ReceiptCompanyHeader";

interface PosDailyCloseModalProps {
  isOpen: boolean;
  report: PosDailyReport | null;
  isLoading?: boolean;
  /** FR-SLREP-008: the unit runs cashier shifts now. */
  shiftsEnabled?: boolean;
  /** The unit ran cashier shifts at some point (a past day may still close from them). */
  hasShiftHistory?: boolean;
  /** The hasShiftHistory check has not answered yet: the close mode is unknown, so Save waits. */
  isShiftHistoryLoading?: boolean;
  onClose: () => void;
}

const METHOD_ICON = { cash: Banknote, bank: Landmark, receivable: FileText } as const;

/** YYYY-MM-DD of an instant on the company's clock. */
const dayIn = (iso: string, timeZone?: string): string => {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
  } catch {
    return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
  }
};

export const PosDailyCloseModal: React.FC<PosDailyCloseModalProps> = ({
  isOpen,
  report,
  isLoading,
  shiftsEnabled,
  hasShiftHistory,
  isShiftHistoryLoading,
  onClose,
}) => {
  const [countedCash, setCountedCash] = useState<string>("");
  const [selectedCashAccountId, setSelectedCashAccountId] = useState<string>("");

  const { data: savedClose } = usePosDailyClose(undefined, isOpen);
  const saveClose = useSavePosDailyClose();
  /** The server asked for a drawer count after all (counted_cash required): show the count input. */
  const [forceCount, setForceCount] = useState(false);

  // FR-SLREP-008: which way the day closes follows what the day holds, as PosController::dailyClose
  // decides it — closed shifts on the day, or shift-stamped cash with no unstamped cash.
  const shiftCash = Number(report?.shift_cash ?? 0);
  const hasUnstampedCash =
    (report?.expected_cash_by_account?.length ?? 0) > 0 || Math.abs(Number(report?.expected_cash ?? 0)) >= 0.005;
  const mayHaveShifts = Boolean(shiftsEnabled || hasShiftHistory || Math.abs(shiftCash) >= 0.005);

  // The day sums every shift closed on it, whenever it opened (the list filters on opened_at, so no
  // lower bound): the latest 100 opened up to the day, kept when closed on the day (company clock).
  const { data: recentShifts, isLoading: isShiftsLoading } = usePosShifts(
    { status: "closed", to: report?.date, per_page: 100 },
    isOpen && mayHaveShifts && !savedClose && Boolean(report),
  );
  const dayShifts = (recentShifts?.data ?? []).filter(
    (s) => s.closed_at && report && dayIn(s.closed_at, report.timezone) === report.date,
  );
  const derivedShiftDay =
    mayHaveShifts && (dayShifts.length > 0 || ((Boolean(shiftsEnabled) || Math.abs(shiftCash) >= 0.005) && !hasUnstampedCash));
  const isShiftDay = savedClose ? Boolean(savedClose.shift_based) : derivedShiftDay && !forceCount;
  const isModeLoading =
    !savedClose && Boolean(report) && ((!shiftsEnabled && Boolean(isShiftHistoryLoading)) || (mayHaveShifts && isShiftsLoading));

  useEffect(() => {
    if (!isOpen) setForceCount(false);
  }, [isOpen]);
  const shiftSums = savedClose
    ? {
        expected: Number(savedClose.expected_cash),
        counted: Number(savedClose.counted_cash),
        difference: Number(savedClose.difference),
      }
    : dayShifts.reduce(
        (acc, s) => ({
          expected: acc.expected + Number(s.expected_cash ?? 0),
          counted: acc.counted + Number(s.counted_cash ?? 0),
          difference: acc.difference + Number(s.difference ?? 0),
        }),
        { expected: 0, counted: 0, difference: 0 },
      );

  const cashAccounts = report?.expected_cash_by_account ?? [];
  const hasMultipleCashAccounts = cashAccounts.length > 1;

  useEffect(() => {
    if (cashAccounts.length === 1 && !selectedCashAccountId) {
      setSelectedCashAccountId(cashAccounts[0].cash_account_id);
    } else if (savedClose?.cash_account_id && !selectedCashAccountId) {
      setSelectedCashAccountId(savedClose.cash_account_id);
    }
  }, [cashAccounts, selectedCashAccountId, savedClose?.cash_account_id]);

  if (!isOpen) {
    return null;
  }

  const handlePrint = () => {
    window.print();
  };

  const selectedAccount = cashAccounts.find((a) => a.cash_account_id === selectedCashAccountId);
  const expectedCash = savedClose
    ? Number(savedClose.expected_cash)
    : selectedAccount
      ? Number(selectedAccount.expected)
      : Number(report?.expected_cash ?? 0);

  const counted = savedClose
    ? Number(savedClose.counted_cash)
    : countedCash.trim() !== "" ? Number(countedCash) : null;
  const difference = counted !== null ? counted - expectedCash : null;

  const isTreasuryRequired = hasMultipleCashAccounts && !savedClose;
  const isTreasuryMissing = isTreasuryRequired && !selectedCashAccountId;

  const handleSave = () => {
    if (isModeLoading) return;
    if (isShiftDay) {
      if (savedClose || saveClose.isPending) return;
      // A shift day takes no count: each shift already posted its own difference.
      saveClose.mutate(
        {},
        {
          onSuccess: () => toast.success("تم حفظ إغلاق الصندوق اليومي"),
          // The day took cash outside shifts and no shift closed on it: the server wants a drawer count.
          onError: (err) => {
            if (apiErrorPayload(err)?.errors?.counted_cash) setForceCount(true);
          },
        },
      );
      return;
    }
    if (counted === null || savedClose || saveClose.isPending || isTreasuryMissing) {
      return;
    }
    saveClose.mutate(
      {
        counted_cash: counted,
        cash_account_id: selectedCashAccountId || undefined,
      },
      { onSuccess: () => toast.success("تم حفظ إغلاق الصندوق اليومي") },
    );
  };

  const saveError = saveClose.isError
    ? apiErrorPayload(saveClose.error)?.errors?.counted_cash
      ? "هذا اليوم قُبض فيه نقد خارج الورديات — أدخل النقد المعدود في الدرج ثم احفظ الإغلاق."
      : salesErrorMessage(saveClose.error, "تعذّر حفظ إغلاق الصندوق")
    : null;

  return (
    <Dialog open={isOpen} onOpenChange={(next) => !next && onClose()}>
      <DialogContent size="lg">
        <DialogHeader className="print:hidden">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-app-accent/15 text-app-accent">
              <DollarSign className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-sm">إغلاق الصندوق والوردية اليومية (Z-Report)</DialogTitle>
              <DialogDescription className="text-[11px]">
                مطابقة النقد الفعلي بالصندوق مع النقد المستلم فعلياً (مبيعات نقدية + تحصيلات نقدية)
              </DialogDescription>
            </div>
          </div>
          <DialogClose />
        </DialogHeader>

        {/* Content Body */}
        <DialogBody className="print-area space-y-5 print:p-0">
          {/* W6-02: the paper copy carries the company profile header (logo, legal name,
              tax / commercial register, address, phone); hidden on screen. */}
          <div className="hidden print:block text-center space-y-1 border-b border-dashed border-gray-300 pb-3 text-black">
            <ReceiptCompanyHeader />
            <p className="text-[11px] text-gray-600 font-sans">تقرير إغلاق الصندوق اليومي (Z-Report)</p>
          </div>
          {isLoading ? (
            <div className="py-12 text-center text-xs text-app-label-secondary">
              جاري تحميل تقرير الصندوق...
            </div>
          ) : !report ? (
            <div className="py-12 text-center text-xs text-app-label-secondary">
              لا توجد بيانات مبيعات مسجلة لليوم الحالي.
            </div>
          ) : (
            <>
              {/* Top KPI Cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-app-separator bg-app-bg-secondary p-3 text-start">
                  <div className="text-[11px] text-app-label-secondary">إجمالي العمليات</div>
                  <div className="text-lg font-bold font-mono text-app-label-primary mt-1">
                    {report.sales_count}
                  </div>
                </div>
                <div className="rounded-xl border border-app-separator bg-app-bg-secondary p-3 text-start">
                  <div className="text-[11px] text-app-label-secondary">إجمالي المبيعات</div>
                  <div className="text-lg font-bold font-mono text-app-accent mt-1">
                    {formatNumber(report.total)} <span className="text-xs font-sans">د.ل</span>
                  </div>
                </div>
                <div className="rounded-xl border border-app-separator bg-app-bg-secondary p-3 text-start">
                  <div className="text-[11px] text-app-label-secondary">تكلفة البضاعة</div>
                  <div className="text-lg font-bold font-mono text-app-label-primary mt-1">
                    {formatNumber(report.total_cost)} <span className="text-xs font-sans">د.ل</span>
                  </div>
                </div>
              </div>

              {/* Sales by payment method */}
              <div className="rounded-xl border border-app-separator bg-app-bg-secondary p-4 space-y-3">
                <div className="text-xs font-bold text-app-label-primary flex items-center gap-1.5">
                  <TrendingUp className="h-4 w-4 text-app-accent" />
                  <span>المبيعات حسب طريقة الدفع</span>
                </div>

                <div className="grid grid-cols-3 gap-3 pt-1">
                  {(["cash", "bank", "receivable"] as const).map((method) => {
                    const row = report.by_method?.[method] ?? { count: 0, total: 0 };
                    const Icon = METHOD_ICON[method];
                    return (
                      <div key={method} className="flex items-center justify-between rounded-lg border border-app-separator bg-app-bg-primary p-3">
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-app-accent" />
                          <div>
                            <div className="text-xs font-semibold text-app-label-primary">{PAYMENT_METHOD_LABEL[method]}</div>
                            <div className="text-[10px] text-app-label-secondary">{row.count} عملية</div>
                          </div>
                        </div>
                        <div className="text-xs font-bold font-mono text-app-label-primary">{formatNumber(row.total)}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Cash actually collected, by treasury — this is what the drawer should match */}
              {report.by_cash_account.length > 0 && (
                <div className="rounded-xl border border-app-separator bg-app-bg-secondary p-4 space-y-2">
                  <div className="text-xs font-bold text-app-label-primary">النقد والمصرفي المُستلم فعلياً حسب الخزينة</div>
                  {report.by_cash_account.map((row) => (
                    <div key={row.cash_account_id ?? "unknown"} className="flex items-center justify-between text-xs">
                      <span className="text-app-label-secondary">{row.name ?? "—"}</span>
                      <span className="font-mono font-bold">{formatNumber(row.total)}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Cash per drawer treasury from expected_cash_by_account */}
              {cashAccounts.length > 0 && (
                <div className="rounded-xl border border-app-separator bg-app-bg-secondary p-4 space-y-2">
                  <div className="text-xs font-bold text-app-label-primary">
                    النقد المتوقع حسب خزائن الدرج
                  </div>
                  <div className="space-y-1.5">
                    {cashAccounts.map((acc) => (
                      <div
                        key={acc.cash_account_id}
                        className="flex items-center justify-between text-xs"
                      >
                        <span className="text-app-label-secondary">{acc.name}</span>
                        <span className="font-mono font-bold text-app-label-primary">
                          {formatNumber(acc.expected)} د.ل
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Cash Drawer Reconciliation Section */}
              <div className="rounded-xl border border-app-separator bg-app-bg-secondary p-4 space-y-3">
                <div className="text-xs font-bold text-app-label-primary">
                  مطابقة النقد في الصندوق (Cash Drawer Reconciliation)
                </div>

                {isShiftDay && (
                  <div className="space-y-3">
                    <div className="text-[11px] font-bold text-app-label-secondary">
                      نتائج ورديات اليوم{!savedClose ? ` (${dayShifts.length} وردية مغلقة)` : ""}
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      {([
                        ["النقد المتوقع", shiftSums.expected],
                        ["النقد المعدود", shiftSums.counted],
                        ["الفرق", shiftSums.difference],
                      ] as const).map(([label, value]) => (
                        <div key={label} className="rounded-xl border border-app-separator bg-app-bg-primary px-3 py-2">
                          <div className="text-[11px] text-app-label-secondary">{label}</div>
                          <div className="text-xs font-mono font-bold text-app-label-primary mt-0.5">{formatNumber(value)} د.ل</div>
                        </div>
                      ))}
                    </div>
                    {report?.shift_cash !== undefined && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-app-label-secondary">صافي النقد المقبوض عبر الورديات</span>
                        <span className="font-mono font-bold">{formatNumber(report.shift_cash)} د.ل</span>
                      </div>
                    )}
                    <p className="text-[11px] text-app-label-secondary font-medium">الفروقات سُجلت عند إغلاق كل وردية</p>
                  </div>
                )}

                {/* Treasury select when multiple cash treasuries, or treasury label */}
                {isShiftDay ? null : hasMultipleCashAccounts && !savedClose ? (
                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-app-label-secondary">
                      خزينة الدرج <span className="text-app-status-danger">*</span>
                    </label>
                    <select
                      value={selectedCashAccountId}
                      onChange={(e) => setSelectedCashAccountId(e.target.value)}
                      className="w-full rounded-xl border border-app-separator bg-app-bg-primary px-3 py-2 text-xs font-semibold text-app-label-primary focus:border-app-accent focus:outline-none"
                      required
                    >
                      <option value="">اختر خزينة الدرج التي تُغلق اليوم…</option>
                      {cashAccounts.map((acc) => (
                        <option key={acc.cash_account_id} value={acc.cash_account_id}>
                          {acc.name} ({formatNumber(acc.expected)} د.ل متوقع)
                        </option>
                      ))}
                    </select>
                    {isTreasuryMissing && (
                      <p className="text-[11px] text-app-status-danger">
                        اختر خزينة الدرج التي تُغلق يومها.
                      </p>
                    )}
                  </div>
                ) : (
                  (savedClose?.cash_account?.name || (cashAccounts.length === 1 && cashAccounts[0]?.name)) && (
                    <div className="text-xs text-app-label-secondary">
                      خزينة الدرج:{" "}
                      <span className="font-bold text-app-label-primary">
                        {savedClose?.cash_account?.name ?? cashAccounts[0]?.name}
                      </span>
                    </div>
                  )
                )}

                {!isShiftDay && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-app-label-secondary mb-1">
                      النقد المتوقع حسب النظام
                    </label>
                    <div className="w-full rounded-xl border border-app-separator bg-app-bg-primary px-3 py-2 text-xs font-mono font-bold text-app-label-primary">
                      {formatNumber(expectedCash)} د.ل
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-app-label-secondary mb-1">
                      النقد الفعلي المعدود بالدرج
                    </label>
                    {savedClose ? (
                      <div className="w-full rounded-xl border border-app-separator bg-app-bg-primary px-3 py-2 text-xs font-mono font-bold text-app-label-primary">
                        {formatNumber(savedClose.counted_cash)} د.ل
                      </div>
                    ) : (
                      <input
                        type="number"
                        step="1"
                        min="0"
                        placeholder="أدخل المبلغ المعدود..."
                        value={countedCash}
                        onChange={(e) => setCountedCash(e.target.value)}
                        className="w-full rounded-xl border border-app-separator bg-app-bg-primary px-3 py-2 text-xs font-mono text-app-label-primary focus:border-app-accent focus:outline-none"
                      />
                    )}
                  </div>
                </div>
                )}

                {/* Saved-close confirmation / save error */}
                {savedClose && (
                  <div className="flex flex-col gap-1.5 rounded-xl bg-app-status-info/15 border border-app-status-info/30 p-3 text-xs font-bold text-app-status-info">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                      <span>
                        تم إغلاق صندوق اليوم وحفظه
                        {savedClose.closed_by?.name ? ` بواسطة ${savedClose.closed_by.name}` : ""}.
                      </span>
                    </div>
                    {(savedClose.journal_entry?.reference || savedClose.journal_entry_id) && (
                      <div className="text-[11px] font-normal text-app-label-primary ps-6">
                        رقم القيد المحاسبي المرحّل:{" "}
                        <span className="font-mono font-bold">
                          {savedClose.journal_entry?.reference ?? savedClose.journal_entry_id}
                        </span>
                      </div>
                    )}
                  </div>
                )}
                {saveError && (
                  <div className="flex items-center gap-2 rounded-xl bg-app-status-danger/15 border border-app-status-danger/30 p-3 text-xs font-bold text-app-status-danger print:hidden">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{saveError}</span>
                  </div>
                )}

                {/* Difference Status */}
                {!isShiftDay && difference !== null && (
                  <div className="space-y-1.5">
                    <div className={`flex items-center gap-2 rounded-xl p-3 text-xs font-bold ${
                      Math.abs(difference) < 0.001
                        ? "bg-app-status-positive/15 text-app-status-positive border border-app-status-positive/30"
                        : difference > 0
                        ? "bg-app-status-warning/15 text-app-status-warning border border-app-status-warning/30"
                        : "bg-app-status-danger/15 text-app-status-danger border border-app-status-danger/30"
                    }`}>
                      {Math.abs(difference) < 0.001 ? (
                        <>
                          <CheckCircle2 className="h-4 w-4 shrink-0" />
                          <span>الصندوق متطابق تماماً مع النقد المستلم فعلياً.</span>
                        </>
                      ) : difference > 0 ? (
                        <>
                          <AlertCircle className="h-4 w-4 shrink-0" />
                          <span>يوجد زيادة في الصندوق بمقدار +{formatNumber(difference)} د.ل</span>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="h-4 w-4 shrink-0" />
                          <span>يوجد عجز في الصندوق بمقدار {formatNumber(difference)} د.ل</span>
                        </>
                      )}
                    </div>
                    <p className="text-[11px] text-app-label-secondary ps-1 font-medium">
                      {Math.abs(difference) < 0.001
                        ? "لا يوجد فرق."
                        : difference < 0
                        ? "سيُسجَّل العجز تلقائياً على حساب عجز الخزائن (625)."
                        : "ستُسجَّل الزيادة تلقائياً على حساب زيادة الخزائن (44)."}
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogBody>

        {/* Footer Actions */}
        <DialogFooter className="print:hidden">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-app-separator bg-app-bg-primary px-4 py-2 text-xs font-semibold text-app-label-secondary hover:bg-app-fill-f1 transition-colors"
          >
            إغلاق
          </button>
          {!savedClose && (
            <button
              type="button"
              onClick={handleSave}
              disabled={
                isModeLoading ||
                (isShiftDay ? saveClose.isPending : counted === null || saveClose.isPending || isTreasuryMissing)
              }
              className="flex items-center gap-2 rounded-xl bg-app-status-positive px-5 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Save className="h-4 w-4" />
              {saveClose.isPending ? "جاري الحفظ..." : "تأكيد وحفظ الإغلاق"}
            </button>
          )}
          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-2 rounded-xl bg-app-accent px-5 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90 transition-opacity"
          >
            <Printer className="h-4 w-4" />
            طباعة تقرير الإغلاق (Z-Report)
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
