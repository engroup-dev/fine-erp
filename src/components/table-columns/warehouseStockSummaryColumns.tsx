import { useMemo } from "react";
import { ColumnDef } from "../ui/DataTable";
import { WarehouseStockSummaryRow } from "../../api/endpoints/inventory";
import { formatNumber } from "../../lib/utils/format";

export function useWarehouseStockSummaryColumns(): ColumnDef<WarehouseStockSummaryRow, unknown>[] {
  return useMemo<ColumnDef<WarehouseStockSummaryRow, unknown>[]>(
    () => [
      {
        id: "item",
        header: "الصنف",
        meta: { exportValue: (r) => `${r.item_code} — ${r.item_name}` },
        cell: ({ row }) => (
          <div>
            <div className="font-medium text-app-label-primary">{row.original.item_name}</div>
            <div className="text-xs text-app-label-tertiary font-mono">{row.original.item_code}</div>
          </div>
        ),
      },
      {
        id: "total_quantity",
        header: "الكمية المتاحة",
        meta: { exportValue: (r) => r.total_quantity, className: "font-mono text-app-label-primary" },
        cell: ({ row }) => `${formatNumber(row.original.total_quantity)} ${row.original.uom}`,
      },
      {
        id: "avg_unit_cost",
        header: "متوسط سعر الوحدة",
        meta: { exportValue: (r) => r.avg_unit_cost, className: "font-mono font-bold text-app-accent" },
        cell: ({ row }) => `${formatNumber(row.original.avg_unit_cost)} LYD`,
      },
      {
        id: "total_value",
        header: "القيمة الإجمالية",
        meta: { exportValue: (r) => r.total_value, className: "font-mono text-app-label-primary" },
        cell: ({ row }) => `${formatNumber(row.original.total_value)} LYD`,
      },
      {
        id: "lots_count",
        header: "عدد الدفعات",
        meta: { exportValue: (r) => r.lots_count, align: "center", className: "font-mono text-app-label-secondary" },
        cell: ({ row }) => row.original.lots_count,
      },
    ],
    [],
  );
}
