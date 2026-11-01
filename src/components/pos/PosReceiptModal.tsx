import React, { useEffect, useRef, useState } from "react";
import { Printer, CheckCircle2 } from "lucide-react";
import { PAYMENT_METHOD_LABEL, Sale, formatSizeCm } from "../../api/endpoints/sales";
import { formatDate, formatDateTime, formatNumber } from "../../lib/utils/format";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose, DialogBody, DialogFooter } from "../ui/Dialog";
import { printReceipt } from "../../lib/printing";
import { toast } from "../../stores/toastStore";
import { ReceiptCompanyHeader, ReceiptFooter } from "../print/ReceiptCompanyHeader";

interface PosReceiptModalProps {
  isOpen: boolean;
  sale: Sale | null;
  onClose: () => void;
  /** Print once as soon as the receipt is on screen (auto-print after a sale). */
  autoPrint?: boolean;
}

const handlePrint = async () => {
  const result = await printReceipt();
  if (!result.ok) toast.error(result.message);
};

/** The thermal (80mm) counter receipt for a cash sale, printed on the spot. */
export const PosReceiptModal: React.FC<PosReceiptModalProps> = ({ isOpen, sale, onClose, autoPrint = false }) => {
  const [tenderedInput, setTenderedInput] = useState("");

  const saleId = sale?.id ?? null;
  const autoPrintedFor = useRef<string | null>(null);

  // Once per sale; wait out the dialog's open animation so the print snapshot holds the whole receipt.
  useEffect(() => {
    if (!autoPrint || !isOpen || !saleId || autoPrintedFor.current === saleId) return;
    const timer = window.setTimeout(() => {
      autoPrintedFor.current = saleId;
      void handlePrint();
    }, 350);
    return () => window.clearTimeout(timer);
  }, [autoPrint, isOpen, saleId]);

  if (!isOpen || !sale) {
    return null;
  }

  const totalAmount = Number(sale.total_amount || 0);
  const saleLines = sale.lines ?? [];
  const hasLineDiscount = saleLines.some((l) => Number(l.discount_amount || 0) > 0);
  const lineDiscountsSum = saleLines.reduce((s, l) => s + Number(l.discount_amount || 0), 0);
  const invoiceDiscount = Number(sale.invoice_discount || 0);
  const totalDiscount = lineDiscountsSum + invoiceDiscount;
  const grossAmount =
    sale.gross_amount !== undefined && sale.gross_amount !== null
      ? Number(sale.gross_amount)
      : totalAmount + totalDiscount;
  const hasAnyDiscount = totalDiscount > 0;
  const isCash = sale.payment_method === "cash";
  // The checkout response carries no sold_by; the payment's receiver is the same cashier.
  const cashierName = sale.sold_by?.name ?? sale.payments?.find((p) => p.received_by?.name)?.received_by?.name ?? null;
  const cashPayment = sale.payments?.find((p) => p.method === "cash");
  const hasSavedTender =
    cashPayment?.tendered_amount !== undefined &&
    cashPayment?.tendered_amount !== null &&
    !isNaN(Number(cashPayment.tendered_amount));

  const tendered = hasSavedTender
    ? Number(cashPayment.tendered_amount)
    : isCash && tenderedInput.trim() !== ""
      ? Number(tenderedInput)
      : totalAmount;

  // W5-08: a receivable (آجل) sale on installments may take a down payment at checkout; only
  // what stays after it is on the client's account.
  const isReceivable = sale.payment_method === "receivable";
  const downPayments = isReceivable
    ? (sale.payments ?? []).filter((p) => !p.sales_return_id && Number(p.amount) > 0)
    : [];
  const plan = isReceivable ? (sale.installment_plan ?? null) : null;
  const paidAmount = downPayments.reduce((s, p) => s + Number(p.amount), 0);
  const creditAmount = plan
    ? Number(plan.totals.remaining)
    : Math.max(0, totalAmount - Math.max(Number(sale.amount_paid || 0), paidAmount));
  const planLines = plan?.lines ?? [];
  const planBase = planLines.length > 0 ? Number(planLines[0].amount) : null;
  const planLast = planLines.length > 1 ? Number(planLines[planLines.length - 1].amount) : null;

  const change =
    hasSavedTender && cashPayment?.change_given !== undefined && cashPayment?.change_given !== null
      ? Number(cashPayment.change_given)
      : isCash
        ? Math.max(0, tendered - totalAmount)
        : 0;

  return (
    <Dialog open={isOpen} onOpenChange={(next) => !next && onClose()}>
      <DialogContent size="sm">
        <DialogHeader className="print:hidden">
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-app-status-positive" />
            <span>إيصال نقطة البيع</span>
          </DialogTitle>
          <DialogClose />
        </DialogHeader>

        {isCash && !hasSavedTender && (
          <div className="px-5 pt-3 print:hidden">
            <label className="block text-[11px] font-semibold text-app-label-secondary mb-1">
              المبلغ المستلم من العميل (للفكة فقط — لا يغيّر مبلغ البيع)
            </label>
            <input
              type="number"
              min="0"
              step="0.5"
              placeholder={String(totalAmount)}
              value={tenderedInput}
              onChange={(e) => setTenderedInput(e.target.value)}
              className="w-40 px-2 py-1.5 border border-app-separator rounded-lg bg-app-bg-secondary text-xs font-mono focus:border-app-accent focus:outline-none"
              dir="ltr"
            />
          </div>
        )}

        <DialogBody className="p-0">
          <div
            id="pos-receipt-print-area"
            className="print-area print-thermal flex-1 overflow-y-auto p-6 bg-white text-black font-mono text-xs space-y-4 print:p-2 print:m-0 print:overflow-visible"
          >
            <div className="text-center space-y-1 border-b border-dashed border-gray-300 pb-3">
              <ReceiptCompanyHeader />
              <p className="text-[11px] text-gray-600 font-sans">إيصال نقطة البيع</p>
              <div className="text-[10px] text-gray-500 pt-1 space-y-0.5">
                <div>رقم البيع: <span className="font-bold">{sale.order_number}</span></div>
                <div>التاريخ: {formatDateTime(sale.created_at || new Date())}</div>
                {cashierName && <div>الكاشير: <span className="font-bold">{cashierName}</span></div>}
                <div>
                  العميل:{" "}
                  <span className="font-bold">
                    {sale.buyer_type === "internal_unit"
                      ? sale.buyer_unit?.name ?? "وحدة داخلية"
                      : sale.buyer_type === "walk_in"
                        ? sale.walk_in_name?.trim() || "زبون عام"
                        : sale.client?.entity?.name ?? "زبون عام"}
                  </span>
                  {sale.buyer_type === "walk_in" && sale.walk_in_phone?.trim()
                    ? ` (${sale.walk_in_phone.trim()})`
                    : sale.buyer_type === "client" && sale.client?.entity?.primary_contact?.phone
                      ? ` (${sale.client.entity.primary_contact.phone})`
                      : ""}
                </div>
                <div>
                  طريقة الدفع: {sale.payment_method ? PAYMENT_METHOD_LABEL[sale.payment_method as keyof typeof PAYMENT_METHOD_LABEL] ?? sale.payment_method : "—"}
                  {sale.cash_account?.name ? ` — ${sale.cash_account.name}` : ""}
                </div>
              </div>
            </div>

            <div className="space-y-2 border-b border-dashed border-gray-300 pb-3">
              <div className="flex justify-between font-bold text-[11px] border-b border-gray-200 pb-1">
                <span className="flex-1">الصنف</span>
                <span className="text-end pe-3">الكمية × السعر</span>
                {hasLineDiscount && <span className="text-end pe-3">الخصم</span>}
                <span className="text-end">الإجمالي</span>
              </div>
              {saleLines.map((line) => {
                const qty = Number(line.quantity || 1);
                const price = Number(line.unit_price || 0);
                const lineDiscount = Number(line.discount_amount || 0);
                const lineNet = qty * price - lineDiscount;
                const size = formatSizeCm(line.length_m, line.width_m, line.height_m);
                return (
                  <div key={line.id} className="flex justify-between items-center text-[11px]">
                    <div className="flex-1 truncate pe-2">
                      <div className="font-semibold text-gray-900">{line.description ?? line.inventory_item?.name ?? "صنف"}</div>
                      {(line.inventory_item?.code || size) && (
                        <div className="text-[9px] text-gray-500">{[line.inventory_item?.code, size].filter(Boolean).join(" · ")}</div>
                      )}
                      {line.stock_lot?.lot_number && (
                        <div className="text-[9px] text-gray-700 font-bold">لوت: {line.stock_lot.lot_number}</div>
                      )}
                    </div>
                    <div className="text-end pe-3 text-gray-700 whitespace-nowrap">
                      {formatNumber(qty)} × {formatNumber(price)}
                    </div>
                    {hasLineDiscount && (
                      <div className="text-end pe-3 text-gray-700 whitespace-nowrap">
                        {lineDiscount > 0 ? `-${formatNumber(lineDiscount)}` : "—"}
                      </div>
                    )}
                    <div className="text-end font-bold text-gray-900 whitespace-nowrap">
                      {formatNumber(lineNet)} د.ل
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="space-y-1.5 text-xs border-b border-dashed border-gray-300 pb-3">
              {hasAnyDiscount ? (
                <>
                  <div className="flex justify-between text-gray-700 text-[11px]">
                    <span>المجموع:</span>
                    <span>{formatNumber(grossAmount)} د.ل</span>
                  </div>
                  <div className="flex justify-between text-gray-700 text-[11px]">
                    <span>الخصم:</span>
                    <span>-{formatNumber(totalDiscount)} د.ل</span>
                  </div>
                  <div className="flex justify-between font-bold text-sm">
                    <span>الصافي:</span>
                    <span>{formatNumber(totalAmount)} د.ل</span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between font-bold text-sm">
                  <span>المجموع الإجمالي:</span>
                  <span>{formatNumber(totalAmount)} د.ل</span>
                </div>
              )}
              {isCash && (
                <>
                  <div className="flex justify-between text-gray-700 text-[11px]">
                    <span>المبلغ المستلم:</span>
                    <span>{formatNumber(tendered)} د.ل</span>
                  </div>
                  <div className="flex justify-between text-gray-700 text-[11px]">
                    <span>الباقي:</span>
                    <span>{formatNumber(change)} د.ل</span>
                  </div>
                </>
              )}
              {isReceivable && (
                <>
                  {downPayments.map((p, idx) => (
                    <div key={p.id || idx} className="flex justify-between text-gray-700 text-[11px]">
                      <span>
                        دفعة مقدمة — {p.method === "cash" ? "نقداً" : p.method === "bank" ? "مصرف" : "شيك"}
                        {p.cash_account?.name ? ` (${p.cash_account.name})` : ""}
                      </span>
                      <span>{formatNumber(Number(p.amount))} د.ل</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-gray-700 text-[11px] font-bold">
                    <span>مقيّد على ذمة العميل</span>
                    <span>{formatNumber(creditAmount)} د.ل</span>
                  </div>
                  {plan && planBase !== null && (
                    <div className="text-[10px] text-gray-700 space-y-0.5 pt-1">
                      <div>
                        تقسيط: {formatNumber(plan.installment_count)} قسط شهري بقيمة {formatNumber(planBase)} د.ل
                        {planLast !== null && Math.abs(planLast - planBase) > 0.0001
                          ? ` (الأخير ${formatNumber(planLast)} د.ل)`
                          : ""}
                      </div>
                      <div>أول قسط يستحق في {formatDate(plan.first_due_date)}</div>
                    </div>
                  )}
                </>
              )}
              {sale.payment_method === "split" && sale.payments && sale.payments.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-dashed border-gray-200">
                  <div className="font-bold text-[11px] text-gray-800">تفاصيل الدفع المجزأ:</div>
                  {sale.payments.map((p, idx) => {
                    const methodLabel =
                      p.method === "cash"
                        ? "نقداً"
                        : p.method === "bank"
                          ? "مصرف"
                          : "شيك";
                    const accountOrCheque =
                      p.method === "cheque"
                        ? (p.cheque?.number || p.cheque?.cheque_no ? `شيك رقم ${p.cheque.number || p.cheque.cheque_no}` : "شيك")
                        : p.cash_account?.name;

                    const pTendered =
                      p.tendered_amount !== undefined &&
                      p.tendered_amount !== null &&
                      !isNaN(Number(p.tendered_amount))
                        ? Number(p.tendered_amount)
                        : null;

                    const pChange =
                      p.change_given !== undefined && p.change_given !== null && !isNaN(Number(p.change_given))
                        ? Number(p.change_given)
                        : pTendered !== null
                          ? Math.max(0, pTendered - Number(p.amount))
                          : null;

                    return (
                      <div key={p.id || idx} className="text-[11px] text-gray-700 space-y-0.5 border-b border-gray-100 pb-1.5 last:border-0 last:pb-0">
                        <div className="flex justify-between">
                          <span>
                            {methodLabel}
                            {accountOrCheque ? ` (${accountOrCheque})` : ""}
                          </span>
                          <span className="font-bold text-gray-900">{formatNumber(Number(p.amount))} د.ل</span>
                        </div>
                        {p.method === "cash" && pTendered !== null && (
                          <div className="ps-2 text-[10px] text-gray-600 space-y-0.5">
                            <div className="flex justify-between">
                              <span>المبلغ المستلم:</span>
                              <span>{formatNumber(pTendered)} د.ل</span>
                            </div>
                            {pChange !== null && (
                              <div className="flex justify-between">
                                <span>الباقي:</span>
                                <span>{formatNumber(pChange)} د.ل</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <ReceiptFooter
              fallback={
                <>
                  <p>شكراً لتعاملكم معنا!</p>
                  <p>البضاعة المباعة تخضع لسياسة الاستبدال والضمان الرسمية</p>
                </>
              }
            />
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
            onClick={() => void handlePrint()}
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
