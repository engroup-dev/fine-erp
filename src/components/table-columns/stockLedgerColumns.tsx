import { useMemo } from "react";
import { Pencil, Scissors, Tag } from "lucide-react";
import { ColumnDef } from "../ui/DataTable";
import { StockLot } from "../../api/endpoints/inventory";
import { formatNumber } from "../../lib/utils/format";

export interface UseStockLedgerColumnsArgs {
  onOpenCutModal: (lot: StockLot) => void;
  /** Edit the lot's shelf (W4-02); omitted for a read-only viewer. */
  onEditBin?: (lot: StockLot) => void;
  /** Print the lot's barcode label (W4-03). */
  onPrintLabel?: (lot: StockLot) => void;
}

export function useStockLedgerColumns({
  onOpenCutModal,
  onEditBin,
  onPrintLabel,
}: UseStockLedgerColumnsArgs): ColumnDef<StockLot, unknown>[] {
  return useMemo<ColumnDef<StockLot, unknown>[]>(
    () => [
      {
        id: "lot_number",
        accessorKey: "lot_number",
        header: "رقم الدفعة",
        meta: { className: "font-mono font-bold text-app-accent" },
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5">
            <span>{row.original.lot_number}</span>
            {onPrintLabel && (
              <button
                type="button"
                onClick={() => onPrintLabel(row.original)}
                aria-label="طباعة ملصق الدفعة"
                title="طباعة ملصق الدفعة"
                className="rounded-md p-1 text-app-label-tertiary hover:bg-app-fill-f1 hover:text-app-accent"
              >
                <Tag className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ),
      },
      {
        id: "bin_location",
        accessorKey: "bin_location",
        header: "موقع الرف",
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-xs text-app-label-primary">{row.original.bin_location || "—"}</span>
            {onEditBin && (
              <button
                type="button"
                onClick={() => onEditBin(row.original)}
                aria-label="تعديل موقع الرف"
                title="تعديل موقع الرف"
                className="rounded-md p-1 text-app-label-tertiary hover:bg-app-fill-f1 hover:text-app-accent"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ),
      },
      {
        id: "item",
        header: "الصنف / رمز الصنف (SKU)",
        meta: { exportValue: (l) => [l.inventory_item?.code, l.inventory_item?.name || "قالب إسفنج"].filter(Boolean).join(" — ") },
        enableSorting: false,
        cell: ({ row }) => (
          <div>
            <div className="font-medium text-app-label-primary">{row.original.inventory_item?.name || "قالب إسفنج"}</div>
            <div className="text-xs text-app-label-tertiary font-mono">{row.original.inventory_item?.code}</div>
          </div>
        ),
      },
      {
        id: "quantity",
        header: "كمية الحاوية والقياس",
        meta: { exportValue: (l) => `${l.container_quantity || 1} ${l.inventory_item?.primary_uom || "unit"} / ${l.volume_m3 ? `${l.volume_m3} m³` : `${l.quantity} ${l.inventory_item?.secondary_uom || l.inventory_item?.unit_of_measure || ""}`}` },
        enableSorting: false,
        cell: ({ row }) => (
          <div>
            <div className="font-bold text-app-label-primary">
              {row.original.container_quantity || 1} {row.original.inventory_item?.primary_uom || "unit"}
            </div>
            <div className="text-xs text-indigo-600 font-mono">
              {row.original.volume_m3
                ? `${row.original.volume_m3} m³`
                : `${row.original.quantity} ${row.original.inventory_item?.secondary_uom || row.original.inventory_item?.unit_of_measure || ""}`}
            </div>
          </div>
        ),
      },
      {
        id: "dimensions",
        header: "الأبعاد / الخصائص",
        enableSorting: false,
        meta: { exportValue: (l) => [l.length_m ? `${l.length_m} × ${l.width_m} × ${l.height_m}` : null, ...Object.entries(l.attribute_values ?? {}).map(([k, v]) => `${k}: ${String(v)}`)].filter(Boolean).join("، "), className: "text-xs font-mono text-app-label-secondary" },
        cell: ({ row }) => (
          <>
            {row.original.length_m ? (
              <div>{`${row.original.length_m}m × ${row.original.width_m}m × ${row.original.height_m}m`}</div>
            ) : null}
            {row.original.attribute_values && Object.keys(row.original.attribute_values).length > 0 ? (
              <div className="flex flex-wrap gap-1 mt-1">
                {Object.entries(row.original.attribute_values).map(([k, v]) => (
                  <span key={k} className="px-1.5 py-0.5 text-[10px] rounded bg-slate-100 text-slate-700 font-sans">
                    {k}: <strong>{String(v)}</strong>
                  </span>
                ))}
              </div>
            ) : null}
          </>
        ),
      },
      {
        id: "unit_cost",
        accessorKey: "unit_cost",
        header: "سعر الوحدة",
        meta: { className: "font-mono text-app-label-primary" },
        cell: ({ row }) => (
          <>
            {formatNumber(row.original.unit_cost)} LYD
          </>
        ),
      },
      {
        id: "grade",
        header: "الدرجة",
        meta: { exportValue: (l) => l.grade },
        enableSorting: false,
        cell: ({ row }) => (
          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-800">
            {row.original.grade}
          </span>
        ),
      },
      {
        id: "status",
        header: "الحالة",
        meta: { exportValue: (l) => l.status },
        enableSorting: false,
        cell: ({ row }) => (
          <span
            className={`px-2 py-1 text-xs font-semibold rounded-full ${
              row.original.status === "available"
                ? "bg-emerald-100 text-emerald-800"
                : "bg-app-fill-f1 text-app-label-secondary"
            }`}
          >
            {row.original.status}
          </span>
        ),
      },
      {
        id: "actions",
        header: "إجراء التشذيب",
        enableSorting: false,
        meta: { export: false, align: "end" },
        cell: ({ row }) => {
          const lot = row.original;
          return lot.status === "available" && lot.length_m ? (
            <button
              onClick={() => onOpenCutModal(lot)}
              className="inline-flex items-center gap-1 rounded-xl bg-app-accent px-2.5 py-1 text-xs font-bold text-white shadow-sm hover:opacity-90 transition-all"
            >
              <Scissors className="w-3.5 h-3.5" /> تشذيب البقايا
            </button>
          ) : (
            <span className="text-xs text-app-label-tertiary">--</span>
          );
        },
      },
    ],
    [onOpenCutModal, onEditBin, onPrintLabel]
  );
}
