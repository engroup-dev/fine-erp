import { useMemo } from "react";
import { Trash2 } from "lucide-react";
import { ColumnDef } from "../ui/DataTable";
import { ProductionBatchMaterial } from "../../api/endpoints/production";
import { UOM_LABELS } from "../../api/endpoints/inventory";
import { formatDateTime, formatNumber } from "../../lib/utils/format";

export interface UseBatchMaterialsColumnsArgs {
  /** Omitted once the batch is closed: its materials can no longer change. */
  onRemove?: (line: ProductionBatchMaterial) => void;
}

/** The issuing user's name, whichever shape the row carries. */
const issuerName = (line: ProductionBatchMaterial): string =>
  typeof line.issued_by === "object" && line.issued_by !== null ? line.issued_by.name : "—";

/** The unit in Arabic (the backend stores codes such as "liter"). */
const uomLabel = (u?: string | null): string => (u ? UOM_LABELS[u] ?? u : "");

// W4-05: chemicals issued to one batch — one row per lot drawn, a short list,
// so no search or pagination.
export function useBatchMaterialsColumns(
  args?: UseBatchMaterialsColumnsArgs,
): ColumnDef<ProductionBatchMaterial, unknown>[] {
  const onRemove = args?.onRemove;

  return useMemo<ColumnDef<ProductionBatchMaterial, unknown>[]>(() => {
    const cols: ColumnDef<ProductionBatchMaterial, unknown>[] = [
      {
        id: "item",
        header: "المادة",
        meta: { exportValue: (r) => [r.inventory_item?.code, r.inventory_item?.name].filter(Boolean).join(" — ") },
        cell: ({ row }) => (
          <div>
            <p className="font-semibold text-app-label-primary">{row.original.inventory_item?.name ?? "—"}</p>
            <p className="text-[10px] font-mono text-app-label-tertiary">{row.original.inventory_item?.code}</p>
          </div>
        ),
      },
      {
        id: "lot",
        header: "اللوت",
        meta: { exportValue: (r) => r.stock_lot?.lot_number, className: "font-mono" },
        cell: ({ row }) => row.original.stock_lot?.lot_number ?? "—",
      },
      {
        id: "quantity",
        header: "الكمية",
        meta: { exportValue: (r) => r.quantity },
        cell: ({ row }) => (
          <span className="font-mono">
            {formatNumber(row.original.quantity, { maximumFractionDigits: 4 })}{" "}
            <span className="text-app-label-tertiary">{uomLabel(row.original.inventory_item?.unit_of_measure)}</span>
          </span>
        ),
      },
      {
        id: "unit_cost",
        header: "تكلفة الوحدة",
        meta: { exportValue: (r) => r.unit_cost, className: "font-mono" },
        cell: ({ row }) => formatNumber(row.original.unit_cost, { maximumFractionDigits: 4 }),
      },
      {
        id: "total_cost",
        header: "الإجمالي (د.ل)",
        meta: { exportValue: (r) => r.total_cost, className: "font-mono font-bold" },
        cell: ({ row }) => formatNumber(row.original.total_cost),
      },
      {
        id: "issued",
        header: "صُرفت بواسطة",
        meta: { exportValue: (r) => `${issuerName(r)} ${formatDateTime(r.created_at)}` },
        cell: ({ row }) => (
          <div>
            <p className="text-app-label-primary">{issuerName(row.original)}</p>
            <p className="text-[10px] font-mono text-app-label-tertiary">{formatDateTime(row.original.created_at)}</p>
          </div>
        ),
      },
    ];

    if (onRemove) {
      cols.push({
        id: "actions",
        header: "",
        meta: { export: false },
        cell: ({ row }) => (
          <button
            type="button"
            onClick={() => onRemove(row.original)}
            title="إزالة وإرجاع الكمية إلى اللوت"
            className="p-1.5 rounded-lg text-app-status-danger hover:bg-app-status-danger/10 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        ),
      });
    }

    return cols;
  }, [onRemove]);
}
