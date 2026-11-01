import { useMemo } from "react";
import { ColumnDef } from "../ui/DataTable";
import { JOURNAL_ENTRY_TYPE_LABEL, type JournalLine } from "../../api/endpoints/accounting";
import { formatDate, formatNumber } from "../../lib/utils/format";

/** A signed debit-minus-credit balance shown as an amount with its side. */
export function BalanceWithSide({ value }: { value: number }) {
  if (Math.abs(value) < 0.00005) {
    return <span className="font-mono text-xs text-app-label-tertiary">0.00</span>;
  }
  return (
    <span className="font-mono text-xs font-bold text-app-label-primary">
      {formatNumber(Math.abs(value))}
      <span className="ms-1 text-[10px] font-semibold text-app-label-tertiary">{value > 0 ? "مدين" : "دائن"}</span>
    </span>
  );
}

export function useChartOfAccountsLedgerColumns(options?: {
  hasForeignCurrency?: boolean;
  currency?: string;
}): ColumnDef<JournalLine, unknown>[] {
  const hasForeignCurrency = options?.hasForeignCurrency;
  const currency = options?.currency;

  return useMemo<ColumnDef<JournalLine, unknown>[]>(
    () => [
      {
        id: "reference",
        header: "المرجع",
        meta: { exportValue: (l) => l.journal_entry?.reference },
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5">
            <span className="font-mono font-bold text-app-accent">
              {row.original.journal_entry?.reference ?? "—"}
            </span>
            {row.original.journal_entry?.entry_type && row.original.journal_entry.entry_type !== "automatic" ? (
              <span className="rounded bg-app-fill-f1 px-1.5 py-0.5 text-[10px] font-semibold text-app-label-secondary">
                {JOURNAL_ENTRY_TYPE_LABEL[row.original.journal_entry.entry_type]}
              </span>
            ) : row.original.journal_entry?.is_manual ? (
              <span className="rounded bg-app-fill-f1 px-1.5 py-0.5 text-[10px] font-semibold text-app-label-secondary">
                يدوي
              </span>
            ) : null}
          </div>
        ),
      },
      {
        id: "date",
        header: "التاريخ",
        meta: { exportValue: (l) => l.journal_entry?.entry_date },
        cell: ({ row }) => (
          <span className="font-mono text-xs text-app-label-secondary">
            {row.original.journal_entry?.entry_date ? formatDate(row.original.journal_entry.entry_date) : "—"}
          </span>
        ),
      },
      {
        id: "operating_unit",
        header: "الوحدة",
        meta: { exportValue: (l) => l.operating_unit?.name ?? "عام الشركة" },
        cell: ({ row }) => (
          <span className="inline-block rounded-md bg-app-bg-secondary px-2 py-0.5 text-xs text-app-label-secondary">
            {row.original.operating_unit?.name ?? "عام الشركة"}
          </span>
        ),
      },
      {
        id: "description",
        header: "الوصف والبيان",
        meta: { exportValue: (l) => { const desc = l.journal_entry?.description; return l.memo && l.memo !== desc ? `${desc ?? ""} — ${l.memo}` : desc; } },
        cell: ({ row }) => {
          const desc = row.original.journal_entry?.description;
          const memo = row.original.memo;
          return (
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-app-label-primary">{desc ?? "—"}</span>
              {memo && memo !== desc && (
                <span className="text-[11px] text-app-label-tertiary">
                  بيان السطر: {memo}
                </span>
              )}
            </div>
          );
        },
      },
      ...(hasForeignCurrency
        ? [
            {
              id: "currency",
              header: "العملة",
              meta: { exportValue: (l: JournalLine) => l.currency },
              enableSorting: false,
              cell: ({ row }: { row: { original: JournalLine } }) => (
                <span className="font-mono text-xs text-app-label-secondary">
                  {row.original.currency ?? "—"}
                </span>
              ),
            },
            {
              id: "original_amount",
              header: "المبلغ الأصلي",
              enableSorting: false,
              meta: { exportValue: (l: JournalLine) => (Number(l.original_amount) > 0 ? l.original_amount : null), align: "end" as const },
              cell: ({ row }: { row: { original: JournalLine } }) => {
                const amount = row.original.original_amount ? Number(row.original.original_amount) : 0;
                return (
                  <span className={`font-mono text-xs ${amount > 0 ? "font-semibold text-app-label-primary" : "text-app-label-tertiary"}`}>
                    {amount > 0 ? formatNumber(amount) : "—"}
                  </span>
                );
              },
            },
            {
              id: "fx_rate",
              header: "سعر الصرف",
              enableSorting: false,
              meta: { exportValue: (l: JournalLine) => (Number(l.fx_rate) > 0 ? l.fx_rate : null), align: "end" as const },
              cell: ({ row }: { row: { original: JournalLine } }) => {
                const rate = row.original.fx_rate ? Number(row.original.fx_rate) : 0;
                return (
                  <span className="font-mono text-xs text-app-label-secondary">
                    {rate > 0 ? Number(row.original.fx_rate) : "—"}
                  </span>
                );
              },
            },
          ]
        : []),
      {
        id: "debit",
        header: "مدين",
        enableSorting: false,
        meta: { exportValue: (l) => (Number(l.debit) > 0 ? l.debit : null), align: "end" },
        cell: ({ row }) => {
          const debit = Number(row.original.debit);
          return (
            <span className={`font-mono text-xs ${debit > 0 ? "font-semibold text-app-label-primary" : "text-app-label-tertiary"}`}>
              {debit > 0 ? formatNumber(debit) : "—"}
            </span>
          );
        },
      },
      {
        id: "credit",
        header: "دائن",
        enableSorting: false,
        meta: { exportValue: (l) => (Number(l.credit) > 0 ? l.credit : null), align: "end" },
        cell: ({ row }) => {
          const credit = Number(row.original.credit);
          return (
            <span className={`font-mono text-xs ${credit > 0 ? "font-semibold text-app-label-primary" : "text-app-label-tertiary"}`}>
              {credit > 0 ? formatNumber(credit) : "—"}
            </span>
          );
        },
      },
      {
        id: "running_balance",
        header: currency ? `الرصيد (${currency})` : "الرصيد",
        enableSorting: false,
        meta: { exportValue: (l) => l.running_balance, align: "end" },
        cell: ({ row }) =>
          row.original.running_balance === undefined ? null : <BalanceWithSide value={row.original.running_balance} />,
      },
    ],
    [hasForeignCurrency, currency],
  );
}
