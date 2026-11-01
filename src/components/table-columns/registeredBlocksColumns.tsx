import { useMemo } from "react";
import { Edit, Tag } from "lucide-react";
import { ColumnDef } from "../ui/DataTable";
import { RowActionsMenu, RowActionItem } from "../ui/RowActionsMenu";
import { StockLot } from "../../api/endpoints/inventory";

export interface UseRegisteredBlocksColumnsArgs {
  onEdit?: (lot: StockLot) => void;
  /** Print the block's barcode label (W4-03). */
  onPrintLabel?: (lot: StockLot) => void;
}

// Registered blocks — the page's main per-batch list; can grow large, so it gets
// sorting/search/pagination like a top-level list would.
export function useRegisteredBlocksColumns(
  args?: UseRegisteredBlocksColumnsArgs,
): ColumnDef<StockLot, unknown>[] {
  const onEdit = args?.onEdit;
  const onPrintLabel = args?.onPrintLabel;

  return useMemo<ColumnDef<StockLot, unknown>[]>(
    () => {
      const cols: ColumnDef<StockLot, unknown>[] = [
        {
          id: "lot_number",
          accessorKey: "lot_number",
          header: "كود البلوك",
          meta: { className: "font-mono font-bold text-app-accent" },
          cell: ({ row }) => row.original.lot_number,
        },
        {
          id: "block_type",
          accessorKey: "block_type",
          header: "نوع البلوك",
          meta: { exportValue: (l) => ({ block: "بلوك", separator: "فاصل", head: "بداية", scrap: "هدر" } as Record<string, string>)[l.block_type ?? "block"] ?? l.block_type },
          cell: ({ row }) => {
            const type = row.original.block_type ?? "block";
            switch (type) {
              case "block":
                return (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400">
                    بلوك
                  </span>
                );
              case "separator":
                return (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400">
                    فاصل
                  </span>
                );
              case "head":
                return (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-600 dark:text-purple-400">
                    بداية
                  </span>
                );
              case "scrap":
                return (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-500/10 text-slate-600 dark:text-slate-400">
                    هدر
                  </span>
                );
              default:
                return <span className="text-xs text-app-label-secondary">{type}</span>;
            }
          },
        },
        {
          id: "sequence_in_batch",
          accessorKey: "sequence_in_batch",
          header: "التسلسل",
          meta: { className: "font-mono" },
          cell: ({ row }) => row.original.sequence_in_batch ?? "—",
        },
        {
          id: "pressure",
          accessorKey: "pressure",
          header: "الضغط",
          meta: { className: "font-mono" },
          cell: ({ row }) => row.original.pressure ?? "—",
        },
        {
          id: "dimensions",
          header: "الأبعاد",
          enableSorting: false,
          meta: { exportValue: (l) => `${l.length_m} × ${l.width_m} × ${l.height_m}`, className: "font-mono text-app-label-secondary" },
          cell: ({ row }) => (
            <>
              {row.original.length_m}م × {row.original.width_m}م × {row.original.height_m}م
            </>
          ),
        },
        {
          id: "volume_m3",
          accessorKey: "volume_m3",
          header: "الحجم",
          meta: { className: "font-mono" },
          cell: ({ row }) => (
            <>
              {row.original.volume_m3} م³
            </>
          ),
        },
        {
          id: "grade",
          header: "الدرجة",
          meta: { exportValue: (l) => l.grade },
          enableSorting: false,
          cell: ({ row }) => (
            <span className="px-2 py-1 text-xs font-semibold rounded-full bg-app-accent-subtle text-app-accent">
              {row.original.grade}
            </span>
          ),
        },
        {
          id: "bin_location",
          accessorKey: "bin_location",
          header: "موقع الرف",
          meta: { className: "font-mono" },
          cell: ({ row }) => row.original.bin_location || "—",
        },
        {
          id: "status",
          accessorKey: "status",
          header: "الحالة",
          meta: { className: "text-app-label-secondary" },
          cell: ({ row }) => row.original.status,
        },
      ];

      if (onEdit || onPrintLabel) {
        cols.push({
          id: "actions",
          header: "الإجراءات",
          enableSorting: false,
          meta: { export: false, align: "end" },
          cell: ({ row }) => {
            const lot = row.original;
            const items: RowActionItem[] = [
              ...(onEdit ? [{ label: "تعديل", icon: Edit, onClick: () => onEdit(lot) }] : []),
              ...(onPrintLabel ? [{ label: "طباعة ملصق", icon: Tag, onClick: () => onPrintLabel(lot) }] : []),
            ];
            return <RowActionsMenu items={items} />;
          },
        });
      }

      return cols;
    },
    [onEdit, onPrintLabel],
  );
}
