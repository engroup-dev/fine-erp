import { useMemo } from "react";
import { Boxes, Edit, Trash2 } from "lucide-react";
import { ColumnDef } from "../ui/DataTable";
import { RowActionsMenu, RowActionItem } from "../ui/RowActionsMenu";
import { ProductionBatch } from "../../api/endpoints/production";

const STATUS_LABELS: Record<string, string> = {
  planned: "مخطط",
  configured: "تم الإعداد",
  running: "قيد التشغيل",
  consumed: "مستهلك",
  curing: "قيد التصلب",
  ready_for_grading: "جاهز للفرز",
  graded: "تم الفرز",
  closed: "مغلق",
};

export interface UseProductionBatchesColumnsArgs {
  onOpenBlocks: (batch: ProductionBatch) => void;
  onEdit: (batch: ProductionBatch) => void;
  onDelete: (batch: ProductionBatch) => void;
}

export function useProductionBatchesColumns({
  onOpenBlocks,
  onEdit,
  onDelete,
}: UseProductionBatchesColumnsArgs): ColumnDef<ProductionBatch, unknown>[] {
  return useMemo<ColumnDef<ProductionBatch, unknown>[]>(
    () => [
      {
        id: "operation_number",
        accessorKey: "operation_number",
        header: "رقم العملية",
        meta: { className: "font-mono font-bold text-app-accent" },
        cell: ({ row }) => row.original.operation_number,
      },
      {
        id: "bun_width_m",
        accessorKey: "bun_width_m",
        header: "عرض الكتلة",
        meta: { className: "font-mono" },
        cell: ({ row }) => <>{row.original.bun_width_m} م</>,
      },
      {
        id: "formula_params",
        header: "الكثافة / الوقت / السرعة",
        enableSorting: false,
        meta: { exportValue: (r) => `${r.formula_params?.density_band ?? "—"} · ${r.formula_params?.cure_time_minutes ?? "—"} دقيقة · ${r.formula_params?.conveyor_speed ?? "—"}`, className: "text-app-label-secondary font-mono" },
        cell: ({ row }) => (
          <>
            {row.original.formula_params?.density_band ?? "—"}
            {" · "}
            {row.original.formula_params?.cure_time_minutes ?? "—"} دقيقة
            {" · "}
            {row.original.formula_params?.conveyor_speed ?? "—"}
          </>
        ),
      },
      {
        id: "blocks_count",
        accessorFn: (b) => b.blocks_count ?? 0,
        header: "البلوكات",
        meta: { className: "font-bold" },
        cell: ({ row }) => row.original.blocks_count ?? 0,
      },
      {
        id: "scrap",
        header: "الهدر",
        enableSorting: false,
        meta: { exportValue: (r) => r.scrap_volume_m3, className: "font-mono text-app-label-secondary" },
        cell: ({ row }) => (
          <>
            {Number(row.original.scrap_volume_m3).toFixed(3)} م³
            {(row.original.scrap_lots_count ?? 0) > 0 && (
              <span className="text-app-label-tertiary"> ({row.original.scrap_lots_count} لوت)</span>
            )}
          </>
        ),
      },
      {
        id: "status",
        header: "الحالة",
        meta: { exportValue: (r) => STATUS_LABELS[r.status] ?? r.status },
        enableSorting: false,
        cell: ({ row }) => (
          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-app-accent-subtle text-app-accent">
            {STATUS_LABELS[row.original.status] ?? row.original.status}
          </span>
        ),
      },
      {
        id: "actions",
        header: "الإجراءات",
        enableSorting: false,
        meta: { export: false, align: "end" },
        cell: ({ row }) => {
          const batch = row.original;
          const items: RowActionItem[] = [
            { label: "البلوكات", icon: Boxes, onClick: () => onOpenBlocks(batch) },
            { label: "تعديل", icon: Edit, onClick: () => onEdit(batch) },
          ];
          if ((batch.blocks_count ?? 0) === 0 && (batch.scrap_lots_count ?? 0) === 0) {
            items.push({ label: "حذف", icon: Trash2, onClick: () => onDelete(batch) });
          }
          return <RowActionsMenu items={items} />;
        },
      },
    ],
    [onOpenBlocks, onEdit, onDelete],
  );
}
