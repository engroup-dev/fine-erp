import { useMemo } from "react";
import { ColumnDef } from "../ui/DataTable";
import { formatNumber, formatDateTime } from "../../lib/utils/format";
import { PaymentRequest } from "../../types/procurement";

export function useBlackMarketColumns(): ColumnDef<PaymentRequest, unknown>[] {
  return useMemo<ColumnDef<PaymentRequest, unknown>[]>(
    () => [
      {
        id: "id",
        header: "المعرف",
        accessorKey: "id",
        cell: ({ row }) => `#${row.original.id.slice(0, 6)}`,
        meta: { className: "font-mono" },
      },
      {
        id: "supplier",
        header: "المورد / أمر الشراء",
        meta: { exportValue: (r) => [r.import_order?.supplier?.name, r.import_order?.order_number].filter(Boolean).join(" — ") },
        enableSorting: false,
        cell: ({ row }) => {
          const supplier = row.original.import_order?.supplier;
          const orderNumber = row.original.import_order?.order_number;
          if (!supplier && !orderNumber) return <span className="text-app-label-tertiary">—</span>;
          return (
            <div className="flex flex-col">
              <span className="font-bold text-app-label-primary text-xs">{supplier?.name ?? "—"}</span>
              {orderNumber ? (
                <span className="text-[10px] text-app-label-secondary font-mono">{orderNumber}</span>
              ) : null}
            </div>
          );
        },
      },
      {
        id: "route",
        header: "المسار",
        meta: { exportValue: (r) => (r.route === "bank" ? "اعتماد مصرفي" : "سوق حر") },
        enableSorting: false,
        cell: ({ row }) => (
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
              row.original.route === "bank"
                ? "bg-app-accent-subtle text-app-accent"
                : "bg-app-status-warning/15 text-app-status-warning"
            }`}
          >
            {row.original.route === "bank" ? "اعتماد مصرفي" : "سوق حر"}
          </span>
        ),
      },
      {
        id: "amount_requested",
        header: "المبلغ الأجنبي",
        accessorFn: (r) => Number(r.amount_requested),
        cell: ({ row }) => `${formatNumber(row.original.amount_requested)} USD`,
        meta: { className: "font-mono font-bold" },
      },
      {
        id: "fx_rate_used",
        header: "سعر الصرف",
        accessorFn: (r) => (r.fx_rate_used !== null && r.fx_rate_used !== undefined ? Number(r.fx_rate_used) : null),
        cell: ({ row }) =>
          row.original.fx_rate_used !== null && row.original.fx_rate_used !== undefined
            ? Number(row.original.fx_rate_used).toFixed(4)
            : "—",
        meta: { className: "font-mono" },
      },
      {
        id: "variance_vs_booked_lyd",
        header: "فرق عن السعر المرجعي (LYD)",
        enableSorting: false,
        cell: ({ row }) => {
          const variance = row.original.variance_vs_booked_lyd;
          if (variance === null || variance === undefined) {
            return <span className="text-app-label-tertiary">—</span>;
          }
          if (Math.abs(Number(variance)) < 0.0001) {
            return <span className="text-app-label-tertiary">0.0000</span>;
          }
          const exceedsHardCap = row.original.variance_exceeds_hard_cap === true;
          return (
            <span
              className={
                Number(variance) > 0
                  ? exceedsHardCap
                    ? "text-app-status-danger font-bold"
                    : "text-app-status-warning font-bold"
                  : "text-app-status-positive font-bold"
              }
            >
              {Number(variance) > 0 ? "+" : ""}
              {formatNumber(variance)}
            </span>
          );
        },
        meta: { exportValue: (r) => r.variance_vs_booked_lyd, className: "font-mono" },
      },
      {
        id: "extra_allocation_note",
        header: "الملاحظة",
        accessorFn: (r) => r.extra_allocation_note || "—",
        meta: { className: "text-app-label-secondary max-w-xs truncate" },
      },
      {
        id: "status",
        header: "الحالة",
        meta: { exportValue: (r) => (r.status === "paid" ? "مدفوع" : r.status === "rejected" ? "مرفوض" : "معلق") },
        enableSorting: false,
        cell: ({ row }) => (
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
              row.original.status === "paid"
                ? "bg-app-status-positive/15 text-app-status-positive"
                : row.original.status === "rejected"
                ? "bg-app-status-danger/15 text-app-status-danger"
                : "bg-app-status-warning/15 text-app-status-warning"
            }`}
          >
            {row.original.status === "paid" ? "مدفوع" : row.original.status === "rejected" ? "مرفوض" : "معلق"}
          </span>
        ),
      },
      {
        id: "created_at",
        header: "التاريخ",
        accessorKey: "created_at",
        cell: ({ row }) => (row.original.created_at ? formatDateTime(row.original.created_at) : "—"),
        meta: { className: "text-app-label-secondary font-mono text-[10px]" },
      },
    ],
    []
  );
}
