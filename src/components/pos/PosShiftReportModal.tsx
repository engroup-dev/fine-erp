import React from "react";
import { FileSpreadsheet, Printer } from "lucide-react";
import { PosShift, PosShiftTotals } from "../../api/endpoints/sales";
import { usePosShift, usePosShiftXReport } from "../../hooks/useSales";
import { formatDateTime, formatInteger, formatNumber } from "../../lib/utils/format";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose, DialogBody, DialogFooter } from "../ui/Dialog";
import { printReceipt } from "../../lib/printing";
import { toast } from "../../stores/toastStore";
import { ReceiptCompanyHeader } from "../print/ReceiptCompanyHeader";

interface PosShiftReportModalProps {
  /** The shift to report on; null keeps the modal closed. */
  shiftId: string | null;
  /** x = the open shift's figures right now; z = the closed shift's stored count. */
  mode: "x" | "z";
  onClose: () => void;
}

const Row: React.FC<{ label: string; value: string; bold?: boolean }> = ({ label, value, bold }) => (
  <div className={`flex justify-between text-[11px] ${bold ? "font-bold text-gray-900" : "text-gray-700"}`}>
    <span>{label}</span>
    <span>{value}</span>
  </div>
);

const money = (v: number | string | null | undefined) => `${formatNumber(v)} د.ل`;

/** The shift's X-report (live, shift stays open) or Z-report (at close) on the 80mm roll. */
export const PosShiftReportModal: React.FC<PosShiftReportModalProps> = ({ shiftId, mode, onClose }) => {
  const isOpen = Boolean(shiftId);
  const xReport = usePosShiftXReport(shiftId, isOpen && mode === "x");
  const zShift = usePosShift(mode === "z" ? shiftId : null);

  if (!isOpen) {
    return null;
  }

  const shift: PosShift | undefined = mode === "x" ? xReport.data?.shift : zShift.data;
  const totals: PosShiftTotals | null | undefined = mode === "x" ? xReport.data?.totals : zShift.data?.totals;
  // A Z-report still holding the open shift (stale cache) waits for the refetch: never print it as a Z.
  const isLoading =
    mode === "x" ? xReport.isLoading : zShift.isLoading || (zShift.isFetching && zShift.data?.status !== "closed");
  const isError = mode === "x" ? xReport.isError : zShift.isError;
  const isClosed = shift?.status === "closed";
  const title = isClosed ? "تقرير Z — إغلاق الوردية" : "تقرير X — قراءة الوردية";

  const expected = isClosed && shift?.expected_cash != null ? Number(shift.expected_cash) : Number(totals?.expected_cash ?? 0);
  const difference = isClosed && shift?.difference != null ? Number(shift.difference) : null;

  return (
    <Dialog open={isOpen} onOpenChange={(next) => !next && onClose()}>
      <DialogContent size="sm">
        <DialogHeader className="print:hidden">
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-app-accent" />
            <span>{title}</span>
          </DialogTitle>
          <DialogClose />
        </DialogHeader>

        <DialogBody className="p-0">
          {isLoading ? (
            <div className="py-12 text-center text-xs text-app-label-secondary">جاري تحميل تقرير الوردية...</div>
          ) : isError || !shift ? (
            <div className="py-12 text-center text-xs text-app-status-danger">تعذّر تحميل تقرير الوردية.</div>
          ) : (
            <div className="print-area print-thermal flex-1 overflow-y-auto p-6 bg-white text-black font-mono text-xs space-y-4 print:p-2 print:m-0 print:overflow-visible">
              <div className="text-center space-y-1 border-b border-dashed border-gray-300 pb-3">
                <ReceiptCompanyHeader />
                <p className="text-[11px] text-gray-600 font-sans">{title}</p>
                <div className="text-[10px] text-gray-500 pt-1 space-y-0.5">
                  <div>رقم الوردية: <span className="font-bold">{shift.number}</span></div>
                  <div>الخزينة: <span className="font-bold">{shift.cash_account?.name ?? "—"}</span></div>
                  <div>الكاشير: <span className="font-bold">{shift.cashier?.name ?? "—"}</span></div>
                  <div>الفتح: {formatDateTime(shift.opened_at)}</div>
                  {isClosed && shift.closed_at ? (
                    <>
                      <div>الإغلاق: {formatDateTime(shift.closed_at)}</div>
                      {shift.closed_by?.name && <div>أغلقها: <span className="font-bold">{shift.closed_by.name}</span></div>}
                    </>
                  ) : (
                    <div>وقت التقرير: {formatDateTime(xReport.data?.generated_at ?? new Date())}</div>
                  )}
                </div>
              </div>

              <div className="space-y-1.5 border-b border-dashed border-gray-300 pb-3">
                <Row label="رصيد بداية الوردية:" value={money(totals?.opening_float ?? shift.opening_float)} />
                <Row label="المقبوضات النقدية:" value={money(totals?.cash_in)} />
                <Row label="المردودات النقدية:" value={money(totals?.cash_refunds)} />
                <Row label="مقبوضات مصرفية:" value={money(totals?.bank)} />
                <Row label="مقبوضات بشيكات:" value={money(totals?.cheque)} />
                <Row label="عدد المبيعات:" value={formatInteger(totals?.sales_count)} />
                <Row label="عدد المرتجعات:" value={formatInteger(totals?.returns_count)} />
              </div>

              <div className="space-y-1.5 border-b border-dashed border-gray-300 pb-3">
                <Row label="النقد المتوقع بالدرج:" value={money(expected)} bold />
                {isClosed && (
                  <>
                    <Row label="النقد المعدود:" value={money(shift.counted_cash)} bold />
                    <Row
                      label={
                        difference === null || Math.abs(difference) < 0.005
                          ? "الفرق:"
                          : difference < 0
                            ? "الفرق (عجز):"
                            : "الفرق (زيادة):"
                      }
                      value={money(difference)}
                      bold
                    />
                  </>
                )}
                {shift.notes && <div className="text-[10px] text-gray-600 pt-1 font-sans">ملاحظات: {shift.notes}</div>}
              </div>

              <div className="text-center text-[10px] text-gray-500 pt-1 font-sans">
                {isClosed ? "توقيع الكاشير: ____________   توقيع المدير: ____________" : "قراءة مؤقتة — الوردية ما زالت مفتوحة"}
              </div>
            </div>
          )}
        </DialogBody>

        <DialogFooter className="print:hidden">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-app-separator bg-app-bg-primary px-3 py-2 text-xs font-semibold text-app-label-primary hover:bg-app-fill-f1 transition-colors"
          >
            إغلاق
          </button>
          <button
            type="button"
            onClick={() => {
              // One copy: receiptCopies (customer + store) is for sale receipts only.
              void printReceipt({ copies: 1 }).then((result) => {
                if (!result.ok) toast.error(result.message);
              });
            }}
            disabled={!shift || isLoading}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-app-accent px-4 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            <Printer className="h-4 w-4" />
            طباعة التقرير
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
