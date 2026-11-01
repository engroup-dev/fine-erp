import React from "react";
import { Printer, Undo2 } from "lucide-react";
import { PrintDocument, PrintTable, Cell, money, PrintDialog } from "./PrintDocument";
import {
  REFUND_METHOD_LABEL,
  RETURN_CONDITION_LABEL,
  SalesReturn,
  SalesReturnLine,
  salesReturnBuyer,
} from "../../api/endpoints/sales";
import { formatDate, formatNumber } from "../../lib/utils/format";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose, DialogBody, DialogFooter } from "../ui/Dialog";
import { ReceiptCompanyHeader, ReceiptFooter } from "./ReceiptCompanyHeader";

const lineLabel = (line: SalesReturnLine): string =>
  line.order_line?.description ?? line.order_line?.inventory_item?.name ?? "صنف";

const refundLabel = (r: SalesReturn): string =>
  `${REFUND_METHOD_LABEL[r.refund_method] ?? r.refund_method}${r.cash_account?.name ? ` — ${r.cash_account.name}` : ""}`;

interface SalesReturnReceiptModalProps {
  salesReturn: SalesReturn | null;
  /** Overrides the buyer read from the return (the create response carries no client name). */
  buyerName?: string | null;
  onClose: () => void;
}

/** The thermal (80mm) counter receipt for a sales return, laid out like the POS sale receipt. */
export const SalesReturnReceiptModal: React.FC<SalesReturnReceiptModalProps> = ({ salesReturn, buyerName, onClose }) => {
  if (!salesReturn) {
    return null;
  }

  const lines = salesReturn.lines ?? [];
  const buyer = buyerName?.trim() || salesReturnBuyer(salesReturn);

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent size="sm">
        <DialogHeader className="print:hidden">
          <DialogTitle className="flex items-center gap-2">
            <Undo2 className="h-4 w-4 text-app-accent" />
            <span>إيصال مرتجع</span>
          </DialogTitle>
          <DialogClose />
        </DialogHeader>

        <DialogBody className="p-0">
          <div className="print-area print-thermal flex-1 overflow-y-auto p-6 bg-white text-black font-mono text-xs space-y-4 print:p-2 print:m-0 print:overflow-visible">
            <div className="text-center space-y-1 border-b border-dashed border-gray-300 pb-3">
              <ReceiptCompanyHeader />
              <p className="text-[11px] text-gray-600 font-sans">إيصال مرتجع مبيعات</p>
              <div className="text-[10px] text-gray-500 pt-1 space-y-0.5">
                <div>رقم المرتجع: <span className="font-bold">{salesReturn.number}</span></div>
                <div>التاريخ: {formatDate(salesReturn.return_date)}</div>
                {salesReturn.order?.order_number && (
                  <div>رقم البيع: <span className="font-bold">{salesReturn.order.order_number}</span></div>
                )}
                <div>العميل: <span className="font-bold">{buyer}</span></div>
              </div>
            </div>

            <div className="space-y-2 border-b border-dashed border-gray-300 pb-3">
              <div className="flex justify-between font-bold text-[11px] border-b border-gray-200 pb-1">
                <span className="flex-1">الصنف</span>
                <span className="text-end pe-3">الكمية</span>
                <span className="text-end">المبلغ</span>
              </div>
              {lines.map((line) => (
                <div key={line.id} className="flex justify-between items-center text-[11px]">
                  <div className="flex-1 truncate pe-2">
                    <div className="font-semibold text-gray-900">{lineLabel(line)}</div>
                    <div className="text-[9px] text-gray-500">
                      {[line.order_line?.inventory_item?.code, RETURN_CONDITION_LABEL[line.condition]].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <div className="text-end pe-3 text-gray-700 whitespace-nowrap">{formatNumber(line.quantity, { maximumFractionDigits: 4 })}</div>
                  <div className="text-end font-bold text-gray-900 whitespace-nowrap">{formatNumber(line.amount)} د.ل</div>
                </div>
              ))}
            </div>

            <div className="space-y-1.5 text-xs border-b border-dashed border-gray-300 pb-3">
              <div className="flex justify-between font-bold text-sm">
                <span>إجمالي المردود:</span>
                <span>{formatNumber(salesReturn.amount)} د.ل</span>
              </div>
              <div className="flex justify-between text-gray-700 text-[11px]">
                <span>طريقة الرد:</span>
                <span>{refundLabel(salesReturn)}</span>
              </div>
            </div>

            {salesReturn.reason?.trim() && (
              <div className="text-[10px] text-gray-600 font-sans">السبب: {salesReturn.reason.trim()}</div>
            )}

            <ReceiptFooter />
          </div>
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
            onClick={() => window.print()}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-app-accent px-4 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90 transition-opacity"
          >
            <Printer className="h-4 w-4" />
            طباعة الإيصال
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/** The A4 return notice ("إشعار مرتجع") the customer and the treasurer sign. */
export const SalesReturnNoticeDocument: React.FC<{ salesReturn: SalesReturn }> = ({ salesReturn }) => {
  const lines = salesReturn.lines ?? [];

  return (
    <PrintDocument
      title="إشعار مرتجع"
      number={salesReturn.number}
      date={salesReturn.created_at ?? salesReturn.return_date}
      meta={[
        { label: "العميل", value: salesReturnBuyer(salesReturn) },
        { label: "رقم البيع", value: <span className="font-mono">{salesReturn.order?.order_number ?? "—"}</span> },
        { label: "طريقة الرد", value: refundLabel(salesReturn) },
        { label: "أنشأه", value: salesReturn.created_by?.name ?? "—" },
        ...(salesReturn.reason?.trim() ? [{ label: "السبب", value: salesReturn.reason.trim() }] : []),
      ]}
      signatures={["توقيع المستلم", "توقيع أمين الخزينة"]}
    >
      <PrintTable head={["#", "البيان", "الحالة", "الكمية", "المبلغ"]}>
        {lines.map((line, i) => (
          <tr key={line.id}>
            <Cell className="w-8 text-center">{i + 1}</Cell>
            <Cell>
              <div className="font-semibold">{lineLabel(line)}</div>
              {line.order_line?.inventory_item?.code && (
                <div className="text-[10px] text-gray-600">{line.order_line.inventory_item.code}</div>
              )}
            </Cell>
            <Cell className="w-36">{RETURN_CONDITION_LABEL[line.condition] ?? line.condition}</Cell>
            <Cell className="w-16 text-center font-mono">{formatNumber(line.quantity, { maximumFractionDigits: 4 })}</Cell>
            <Cell className="w-28 text-end font-mono">{money(line.amount)}</Cell>
          </tr>
        ))}
        <tr>
          <Cell colSpan={4} className="text-end font-bold">إجمالي المردود</Cell>
          <Cell className="text-end font-mono font-bold">{money(salesReturn.amount)}</Cell>
        </tr>
      </PrintTable>
    </PrintDocument>
  );
};

export const SalesReturnNoticeDialog: React.FC<{ salesReturn: SalesReturn | null; onClose: () => void }> = ({
  salesReturn,
  onClose,
}) => (
  <PrintDialog open={Boolean(salesReturn)} onClose={onClose} title="إشعار مرتجع">
    {salesReturn && <SalesReturnNoticeDocument salesReturn={salesReturn} />}
  </PrintDialog>
);
