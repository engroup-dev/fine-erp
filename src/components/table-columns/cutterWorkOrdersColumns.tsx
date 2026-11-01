import { useMemo } from "react";
import { Scissors, Building2, Home, Package } from "lucide-react";
import { ColumnDef } from "../ui/DataTable";
import { CutterWorkOrder, CUTTER_STATUS_LABEL } from "../../api/endpoints/cutter";
import { formatNumber } from "../../lib/utils/format";

export interface UseCutterWorkOrdersColumnsArgs {
  onOpenOrder: (order: CutterWorkOrder) => void;
}

export function useCutterWorkOrdersColumns({
  onOpenOrder,
}: UseCutterWorkOrdersColumnsArgs): ColumnDef<CutterWorkOrder, unknown>[] {
  return useMemo<ColumnDef<CutterWorkOrder, unknown>[]>(
    () => [
      {
        id: "order_number",
        accessorKey: "order_number",
        header: "الأمر",
        meta: { className: "font-mono font-bold text-app-accent" },
        cell: ({ row }) => row.original.order_number,
      },
      {
        id: "source",
        header: "المصدر",
        meta: { exportValue: (r) => (r.client_id ? "عميل" : "داخلي") },
        enableSorting: false,
        cell: ({ row }) =>
          row.original.client_id ? (
            <span className="inline-flex items-center gap-1 text-app-label-primary">
              <Building2 className="w-3.5 h-3.5" /> عميل
            </span>
          ) : (
            // Internal orders skip the credit check entirely.
            <span className="inline-flex items-center gap-1 text-app-label-secondary">
              <Home className="w-3.5 h-3.5" /> داخلي
            </span>
          ),
      },
      {
        id: "blocks",
        header: "البلوكات",
        meta: { exportValue: (r) => (r.blocks ?? []).map((b) => b.stock_lot?.lot_number).filter(Boolean).join("، ") },
        enableSorting: false,
        cell: ({ row }) => {
          const blocks = row.original.blocks ?? [];
          if (blocks.length === 0) return <span className="text-app-label-tertiary">—</span>;
          return (
            <div className="flex flex-col gap-0.5">
              {blocks.map((b) => (
                <span key={b.id} className="inline-flex items-center gap-1 font-mono text-app-accent">
                  <Package className="h-3 w-3" /> {b.stock_lot?.lot_number}
                </span>
              ))}
              <span className="text-[10px] text-app-label-tertiary">
                {formatNumber(blocks.reduce((sum, b) => sum + Number(b.unit_cost_snapshot), 0))} مثبت
              </span>
            </div>
          );
        },
      },
      {
        id: "lines_count",
        accessorFn: (o) => o.lines_count ?? o.lines?.length ?? 0,
        header: "البنود",
        meta: { className: "font-bold" },
        cell: ({ row }) => row.original.lines_count ?? row.original.lines?.length ?? 0,
      },
      {
        id: "wip_cost",
        accessorKey: "wip_cost",
        header: "المواد في الأمر",
        meta: { className: "font-mono text-app-label-secondary" },
        cell: ({ row }) => <>{formatNumber(row.original.wip_cost)} LYD</>,
      },
      {
        id: "status",
        header: "الحالة",
        meta: { exportValue: (r) => CUTTER_STATUS_LABEL[r.status] },
        enableSorting: false,
        cell: ({ row }) => (
          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-app-accent-subtle text-app-accent">
            {CUTTER_STATUS_LABEL[row.original.status]}
          </span>
        ),
      },
      {
        id: "actions",
        header: "الإجراءات",
        enableSorting: false,
        meta: { export: false, align: "end" },
        cell: ({ row }) => (
          <button
            onClick={() => onOpenOrder(row.original)}
            className="inline-flex items-center gap-1 rounded-xl bg-app-accent px-2.5 py-1 text-xs font-bold text-white shadow-sm hover:opacity-90 transition-all"
          >
            <Scissors className="w-3.5 h-3.5" /> فتح
          </button>
        ),
      },
    ],
    [onOpenOrder],
  );
}
