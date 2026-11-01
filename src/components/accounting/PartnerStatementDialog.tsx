import React, { useState } from "react";
import {
  FileText,
  Printer,
  Calendar,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  Building2,
  Phone,
  Wallet,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
  DialogClose,
} from "../ui/Dialog";
import { PrintDocument, PrintTable, Cell } from "../print/PrintDocument";
import { usePartnerStatement } from "../../hooks/usePartnerReports";
import { formatDate, formatDateTime, formatNumber } from "../../lib/utils/format";

interface PartnerStatementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  partyType: "client" | "supplier";
  partyId: string | null;
  partyName?: string;
}

export const PartnerStatementDialog: React.FC<PartnerStatementDialogProps> = ({
  open,
  onOpenChange,
  partyType,
  partyId,
  partyName,
}) => {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data: statement, isLoading, isFetching, refetch } = usePartnerStatement(
    partyType,
    partyId,
    { from: from || undefined, to: to || undefined },
    open
  );

  const handlePrint = () => {
    window.print();
  };

  const isClient = partyType === "client";
  const currency = statement?.party?.currency || "LYD";

  // Balance interpretation
  // Client: > 0 means client owes Fine (مدين), < 0 means Fine owes client (دائن)
  // Supplier: > 0 means Fine owes supplier (دائن), < 0 means supplier owes Fine (مدين)
  const closingBal = statement?.closing_balance ?? 0;
  const isSettled = Math.abs(closingBal) < 0.0001;

  let balanceBadge = "مسدد";
  let badgeColor = "bg-app-status-positive/15 text-app-status-positive";

  if (!isSettled) {
    if (isClient) {
      if (closingBal > 0) {
        balanceBadge = "رصيد مدين (مطلوب من العميل)";
        badgeColor = "bg-app-status-danger/15 text-app-status-danger";
      } else {
        balanceBadge = "رصيد دائن (دفعة مقدمة للعميل)";
        badgeColor = "bg-app-status-info/15 text-app-status-info";
      }
    } else {
      if (closingBal > 0) {
        balanceBadge = "رصيد دائن (مستحق للمورد)";
        badgeColor = "bg-app-status-danger/15 text-app-status-danger";
      } else {
        balanceBadge = "رصيد مدين (دفعة مقدمة للمورد)";
        badgeColor = "bg-app-status-info/15 text-app-status-info";
      }
    }
  }

  return (
    // Chromium never splits a position:fixed box across printed pages, and the dialog's
    // max-height/overflow would clip the statement: on paper nothing above the
    // .print-area may be fixed or clipped, or a long statement prints only its first page.
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      className="print:static print:block print:p-0 print:bg-transparent print:backdrop-blur-none"
    >
      <DialogContent
        size="full"
        className="max-w-5xl print:max-w-none print:m-0 print:max-h-none print:overflow-visible print:border-none print:shadow-none"
      >
        <DialogHeader className="border-b border-app-separator pb-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between w-full">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-app-accent-subtle text-app-accent">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-app-label-primary">
                  كشف حساب {isClient ? "عميل" : "مورد"}: {statement?.party?.name || partyName || "..."}
                </DialogTitle>
                <div className="flex items-center gap-3 text-xs text-app-label-secondary mt-0.5">
                  <span className="flex items-center gap-1">
                    <Building2 className="w-3.5 h-3.5 text-app-accent" />
                    {statement?.party?.operating_unit_name || "الوحدة التشغيلية"}
                  </span>
                  {statement?.party?.phone && (
                    <span className="flex items-center gap-1 font-mono" dir="ltr">
                      <Phone className="w-3.5 h-3.5 text-app-label-tertiary" />
                      {statement.party.phone}
                    </span>
                  )}
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${badgeColor}`}>
                    {balanceBadge}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 print:hidden">
              <button
                type="button"
                onClick={handlePrint}
                disabled={isLoading || !statement}
                className="disabled:opacity-50 flex items-center gap-1.5 rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-1.5 text-xs font-semibold text-app-label-primary hover:bg-app-fill-f1 transition-colors"
                title="طباعة كشف الحساب"
              >
                <Printer className="w-4 h-4 text-app-accent" />
                <span>طباعة</span>
              </button>
              <DialogClose />
            </div>
          </div>
        </DialogHeader>

        <DialogBody className="space-y-4 pt-3 print:overflow-visible">
          {/* Filters Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-app-separator bg-app-bg-secondary p-3 print:hidden">
            <div className="flex flex-wrap items-center gap-3 text-xs text-app-label-secondary">
              <span className="flex items-center gap-1 font-bold text-app-label-primary">
                <Calendar className="w-3.5 h-3.5 text-app-accent" />
                فترة كشف الحساب:
              </span>
              <label className="flex items-center gap-1.5">
                <span>من</span>
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="rounded-lg border border-app-separator bg-app-bg-primary px-2.5 py-1 text-xs text-app-label-primary focus:border-app-accent focus:outline-none"
                />
              </label>
              <label className="flex items-center gap-1.5">
                <span>إلى</span>
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="rounded-lg border border-app-separator bg-app-bg-primary px-2.5 py-1 text-xs text-app-label-primary focus:border-app-accent focus:outline-none"
                />
              </label>
              {(from || to) && (
                <button
                  type="button"
                  onClick={() => {
                    setFrom("");
                    setTo("");
                  }}
                  className="text-xs text-app-accent hover:underline font-semibold"
                >
                  مسح التاريخ
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => refetch()}
              className="flex items-center gap-1.5 rounded-lg border border-app-separator bg-app-bg-primary px-2.5 py-1 text-xs font-semibold text-app-label-secondary hover:text-app-label-primary"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
              <span>تحديث</span>
            </button>
          </div>

          {/* Metric Summary Cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 print:hidden">
            <div className="rounded-xl border border-app-separator bg-app-bg-primary p-3">
              <span className="text-[11px] font-semibold text-app-label-secondary">الرصيد الافتتاحي</span>
              <p className="mt-1 text-base font-bold font-mono text-app-label-primary">
                {formatNumber(statement?.opening_balance ?? 0)}{" "}
                <span className="text-[10px] font-normal">{currency}</span>
              </p>
            </div>

            <div className="rounded-xl border border-app-separator bg-app-bg-primary p-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-app-label-secondary">
                  {isClient ? "مجموع الفواتير (مدين)" : "مجموع السداد (مدين)"}
                </span>
                <ArrowUpRight className="w-3.5 h-3.5 text-app-accent" />
              </div>
              <p className="mt-1 text-base font-bold font-mono text-app-label-primary">
                {formatNumber(statement?.total_debit ?? 0)}{" "}
                <span className="text-[10px] font-normal">{currency}</span>
              </p>
            </div>

            <div className="rounded-xl border border-app-separator bg-app-bg-primary p-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-app-label-secondary">
                  {isClient ? "مجموع السداد (دائن)" : "مجموع المشتريات (دائن)"}
                </span>
                <ArrowDownLeft className="w-3.5 h-3.5 text-app-status-positive" />
              </div>
              <p className="mt-1 text-base font-bold font-mono text-app-label-primary">
                {formatNumber(statement?.total_credit ?? 0)}{" "}
                <span className="text-[10px] font-normal">{currency}</span>
              </p>
            </div>

            <div className="rounded-xl border border-app-separator bg-app-bg-secondary p-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-app-label-primary">الرصيد الختامي المستحق</span>
                <Wallet className="w-3.5 h-3.5 text-app-accent" />
              </div>
              <p className={`mt-1 text-base font-bold font-mono ${isSettled ? "text-app-status-positive" : "text-app-accent"}`}>
                {formatNumber(closingBal)}{" "}
                <span className="text-[10px] font-normal">{currency}</span>
              </p>
            </div>
          </div>

          {/* Ledger Table */}
          <div className="rounded-xl border border-app-separator bg-app-bg-primary shadow-sm overflow-hidden print:hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-end text-xs">
                <thead>
                  <tr className="border-b border-app-separator bg-app-bg-secondary text-[11px] font-bold text-app-label-secondary">
                    <th className="px-3 py-2 text-start">التاريخ والوقت</th>
                    <th className="px-3 py-2 text-start">نوع المستند</th>
                    <th className="px-3 py-2 text-start">رقم المرجع</th>
                    <th className="px-3 py-2 text-start">البيان / الملاحظات</th>
                    <th className="px-3 py-2 text-end font-mono">مدين ({currency})</th>
                    <th className="px-3 py-2 text-end font-mono">دائن ({currency})</th>
                    <th className="px-3 py-2 text-end font-mono">الرصيد التراكمي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-app-separator">
                  {/* Opening Balance Row */}
                  <tr className="bg-app-fill-f1/40 font-semibold text-app-label-secondary">
                    <td className="px-3 py-2" colSpan={4}>
                      رصيد افتتاحي منقول (سابق لتاريخ البداية)
                    </td>
                    <td className="px-3 py-2 text-end font-mono">—</td>
                    <td className="px-3 py-2 text-end font-mono">—</td>
                    <td className="px-3 py-2 text-end font-mono font-bold text-app-label-primary">
                      {formatNumber(statement?.opening_balance ?? 0)}
                    </td>
                  </tr>

                  {isLoading ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-app-label-secondary">
                        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-app-accent" />
                        جاري تحميل كشف الحساب...
                      </td>
                    </tr>
                  ) : statement?.transactions && statement.transactions.length > 0 ? (
                    statement.transactions.map((tx, index) => (
                      <tr key={`${tx.id}-${index}`} className="hover:bg-app-fill-f1/30 transition-colors">
                        <td className="px-3 py-2 font-mono text-[11px] text-app-label-secondary text-start" dir="ltr">
                          {tx.date.replace("T", " ").substring(0, 16)}
                        </td>
                        <td className="px-3 py-2 text-start">
                          <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-app-bg-secondary border border-app-separator">
                            {tx.document_type_label}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-mono font-semibold text-app-label-primary text-start">
                          {tx.document_number}
                        </td>
                        <td className="px-3 py-2 text-app-label-secondary text-start max-w-xs truncate" title={tx.memo}>
                          {tx.memo}
                        </td>
                        <td className="px-3 py-2 text-end font-mono font-medium text-app-label-primary">
                          {tx.debit > 0 ? formatNumber(tx.debit) : "—"}
                        </td>
                        <td className="px-3 py-2 text-end font-mono font-medium text-app-label-primary">
                          {tx.credit > 0 ? formatNumber(tx.credit) : "—"}
                        </td>
                        <td className="px-3 py-2 text-end font-mono font-bold text-app-accent">
                          {formatNumber(tx.running_balance)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-app-label-tertiary">
                        لا توجد حركات مسجلة خلال هذه الفترة.
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-app-separator bg-app-bg-secondary font-bold text-app-label-primary">
                    <td className="px-3 py-2.5 text-start" colSpan={4}>
                      صافي حركة الفترة والرصيد النهائي
                    </td>
                    <td className="px-3 py-2.5 text-end font-mono text-app-accent">
                      {formatNumber(statement?.total_debit ?? 0)}
                    </td>
                    <td className="px-3 py-2.5 text-end font-mono text-app-status-positive">
                      {formatNumber(statement?.total_credit ?? 0)}
                    </td>
                    <td className="px-3 py-2.5 text-end font-mono text-base text-app-label-primary">
                      {formatNumber(closingBal)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* W6-02: the paper copy — a PrintDocument, so it carries the company profile
              header (logo, legal name, tax / commercial register, address, phone). */}
          {statement && (
            <div className="hidden print:block">
              <PrintDocument
                title={`كشف حساب ${isClient ? "عميل" : "مورد"}`}
                number={statement.party.name}
                date={new Date().toISOString()}
                issuer={statement.party.operating_unit_name}
                meta={[
                  ...(statement.party.phone
                    ? [{ label: "الهاتف", value: <span dir="ltr">{statement.party.phone}</span> }]
                    : []),
                  {
                    label: "الفترة",
                    value: `${from ? formatDate(from) : "بداية الدفاتر"} — ${to ? formatDate(to) : "اليوم"}`,
                  },
                  { label: "العملة", value: currency },
                  { label: "الرصيد الافتتاحي", value: formatNumber(statement.opening_balance) },
                  { label: "الرصيد الختامي", value: `${formatNumber(closingBal)} — ${balanceBadge}` },
                ]}
                signatures={["المحاسب", "المدير المالي"]}
                footerNote="تم إنشاء هذا الكشف استناداً إلى القيود وسجلات المعاملات التشغيلية المعتمدة."
              >
                <PrintTable
                  head={[
                    "التاريخ",
                    "نوع المستند",
                    "المرجع",
                    "البيان",
                    `مدين (${currency})`,
                    `دائن (${currency})`,
                    "الرصيد التراكمي",
                  ]}
                >
                  <tr className="font-semibold">
                    <Cell colSpan={6}>رصيد افتتاحي منقول (سابق لتاريخ البداية)</Cell>
                    <Cell className="text-end font-mono">{formatNumber(statement.opening_balance)}</Cell>
                  </tr>
                  {(statement.transactions ?? []).map((tx, index) => (
                    <tr key={`${tx.id}-${index}`}>
                      <Cell className="font-mono">{formatDateTime(tx.date)}</Cell>
                      <Cell>{tx.document_type_label}</Cell>
                      <Cell className="font-mono">{tx.document_number}</Cell>
                      <Cell>{tx.memo || "—"}</Cell>
                      <Cell className="text-end font-mono">{tx.debit > 0 ? formatNumber(tx.debit) : ""}</Cell>
                      <Cell className="text-end font-mono">{tx.credit > 0 ? formatNumber(tx.credit) : ""}</Cell>
                      <Cell className="text-end font-mono">{formatNumber(tx.running_balance)}</Cell>
                    </tr>
                  ))}
                  <tr className="font-bold">
                    <Cell colSpan={4}>صافي حركة الفترة والرصيد النهائي</Cell>
                    <Cell className="text-end font-mono">{formatNumber(statement.total_debit)}</Cell>
                    <Cell className="text-end font-mono">{formatNumber(statement.total_credit)}</Cell>
                    <Cell className="text-end font-mono">{formatNumber(closingBal)}</Cell>
                  </tr>
                </PrintTable>
              </PrintDocument>
            </div>
          )}
        </DialogBody>

        <DialogFooter className="border-t border-app-separator pt-3 print:hidden">
          <div className="flex items-center justify-between w-full">
            <span className="text-[11px] text-app-label-tertiary">
              تم إنشاء هذا الكشف استناداً إلى القيود وسجلات المعاملات التشغيلية المعتمدة.
            </span>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-xl border border-app-separator bg-app-bg-secondary px-4 py-1.5 text-xs font-semibold text-app-label-primary hover:bg-app-fill-f1"
            >
              إغلاق
            </button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
