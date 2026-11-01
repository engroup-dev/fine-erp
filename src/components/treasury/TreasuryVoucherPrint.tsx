import React from "react";
import { PrintDialog, PrintDocument } from "../print/PrintDocument";
import type { TreasuryVoucher } from "../../api/endpoints/treasuryVouchers";
import { formatNumber } from "../../lib/utils/format";

export interface TreasuryVoucherPrintProps {
  open: boolean;
  onClose: () => void;
  voucher: TreasuryVoucher | null;
}

export const TreasuryVoucherPrint: React.FC<TreasuryVoucherPrintProps> = ({
  open,
  onClose,
  voucher,
}) => {
  if (!voucher) return null;

  const isReceipt = voucher.kind === "receipt";
  const docTitle = isReceipt ? "سند قبض" : "سند صرف";
  const partyLabel = isReceipt ? "استلمنا من السيد / السادة:" : "صرفنا إلى السيد / السادة:";
  const partyName =
    voucher.payee ||
    voucher.client?.name ||
    (voucher.counter_account ? voucher.counter_account.name : "—");
  const isNonLyd = voucher.currency !== "LYD" && voucher.currency !== "د.ل";

  // W5-02: an advances (1215) voucher names the employee.
  const employeeName = voucher.employee ? (voucher.employee.name ?? voucher.employee.employee_number) : null;
  const employeeSuffix = employeeName ? ` — الموظف: ${employeeName}` : "";
  const counterPartyDisplay = voucher.client
    ? `العميل: ${voucher.client.name}`
    : voucher.counter_account
    ? `${voucher.counter_account.code} — ${voucher.counter_account.name}${employeeSuffix}`
    : "—";

  return (
    <PrintDialog open={open} onClose={onClose} title={`${docTitle} — ${voucher.voucher_number}`}>
      <PrintDocument
        title={docTitle}
        number={voucher.voucher_number}
        date={voucher.voucher_date}
        meta={[
          { label: "التاريخ", value: voucher.voucher_date },
          { label: "الخزينة", value: voucher.cash_account.name },
          { label: "الطرف المقابل", value: counterPartyDisplay },
          { label: "رقم القيد", value: voucher.journal_entry?.reference ?? "—" },
        ]}
        signatures={["المحاسب", "أمين الخزينة", "المستلم"]}
      >
        {/* Cancelled Banner */}
        {voucher.status === "cancelled" && (
          <div className="rounded-lg border-2 border-red-600 bg-red-50 p-3 text-center text-red-700">
            <div className="text-base font-bold tracking-wide">هذا السند ملغى</div>
            {voucher.cancel_reason && (
              <div className="mt-1 text-xs font-semibold">سبب الإلغاء: {voucher.cancel_reason}</div>
            )}
            {voucher.cancel_entry && (
              <div className="mt-0.5 text-[11px] font-mono">
                قيد الإلغاء العكسي: {voucher.cancel_entry.reference}
              </div>
            )}
          </div>
        )}

        {/* Amount Box */}
        <div className="rounded-lg border border-gray-400 bg-gray-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-baseline gap-2">
              <span className="text-xs font-bold text-gray-700">المبلغ بالأرقام:</span>
              <span className="font-mono text-xl font-bold tracking-tight">
                {formatNumber(voucher.amount)} {voucher.currency}
              </span>
            </div>
            {isNonLyd && (
              <div className="text-xs font-mono text-gray-700">
                المعادل بالدينار: <span className="font-bold">{formatNumber(voucher.amount_lyd)} د.ل</span>
                {" "}(سعر الصرف: {voucher.fx_rate})
              </div>
            )}
          </div>
        </div>

        {/* Voucher Body Details */}
        <div className="space-y-3.5 rounded-lg border border-gray-300 p-4 text-xs leading-loose">
          <div className="flex items-baseline gap-2">
            <span className="shrink-0 font-bold text-gray-700">{partyLabel}</span>
            <span className="flex-1 border-b border-dotted border-gray-500 pb-0.5 font-semibold text-[13px]">
              {partyName}
            </span>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="shrink-0 font-bold text-gray-700">وذلك عن (البيان):</span>
            <span className="flex-1 border-b border-dotted border-gray-500 pb-0.5 font-medium">
              {voucher.description}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-1">
            <div className="flex items-baseline gap-2">
              <span className="shrink-0 font-bold text-gray-700">الحساب المقابل:</span>
              <span className="font-mono text-gray-800">
                {voucher.counter_account
                  ? `${voucher.counter_account.code} — ${voucher.counter_account.name}${employeeSuffix}`
                  : (voucher.client?.name ?? "—")}
              </span>
            </div>

            <div className="flex items-baseline gap-2">
              <span className="shrink-0 font-bold text-gray-700">الخزينة المودع فيها / المصروف منها:</span>
              <span className="font-semibold text-gray-800">{voucher.cash_account.name}</span>
            </div>
          </div>
        </div>
      </PrintDocument>
    </PrintDialog>
  );
};
