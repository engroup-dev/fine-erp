import { useMemo } from "react";
import { Trash2 } from "lucide-react";
import { ColumnDef } from "../ui/DataTable";
import { DraftRow } from "../../pages/manufacturing/BatchBlocksPage";

export interface UseBatchDraftRowsColumnsArgs {
  rowsCount: number;
  rowTotal: (row: DraftRow) => number;
  rowVolume: (row: DraftRow) => number;
  onUpdateRow: (key: string, patch: Partial<DraftRow>) => void;
  onRemoveRow: (key: string) => void;
}

// Draft registration rows — a small, user-built list (typically 1-5 rows) edited inline
// before submit, so no search/pagination/sorting here either.
export function useBatchDraftRowsColumns({
  rowsCount,
  rowTotal,
  rowVolume,
  onUpdateRow,
  onRemoveRow,
}: UseBatchDraftRowsColumnsArgs): ColumnDef<DraftRow, unknown>[] {
  return useMemo<ColumnDef<DraftRow, unknown>[]>(
    () => [
      {
        id: "kind",
        header: "النوع",
        cell: ({ row }) => (
          <select
            value={row.original.kind}
            onChange={(e) => onUpdateRow(row.original.key, { kind: e.target.value as DraftRow["kind"] })}
            className="w-full px-2 py-1.5 border border-app-separator rounded-lg bg-app-bg-secondary text-xs focus:border-app-accent focus:outline-none"
          >
            <option value="block">بلوك</option>
            <option value="separator">فاصل</option>
            <option value="head">بداية</option>
            <option value="scrap">هدر</option>
          </select>
        ),
      },
      {
        id: "length_m",
        header: "الطول (م)",
        cell: ({ row }) => (
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={row.original.length_m}
            onChange={(e) => onUpdateRow(row.original.key, { length_m: e.target.value })}
            className="w-20 px-2 py-1.5 border border-app-separator rounded-lg bg-app-bg-secondary text-xs font-mono focus:border-app-accent focus:outline-none"
          />
        ),
      },
      {
        id: "height_m",
        header: "الارتفاع (م)",
        cell: ({ row }) => (
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={row.original.height_m}
            onChange={(e) => onUpdateRow(row.original.key, { height_m: e.target.value })}
            className="w-20 px-2 py-1.5 border border-app-separator rounded-lg bg-app-bg-secondary text-xs font-mono focus:border-app-accent focus:outline-none"
          />
        ),
      },
      {
        id: "count",
        header: "العدد",
        cell: ({ row }) => (
          <input
            type="number"
            min="1"
            value={row.original.count}
            onChange={(e) => onUpdateRow(row.original.key, { count: e.target.value })}
            className="w-16 px-2 py-1.5 border border-app-separator rounded-lg bg-app-bg-secondary text-xs font-mono focus:border-app-accent focus:outline-none"
          />
        ),
      },
      {
        id: "pressure",
        header: "الضغط",
        cell: ({ row }) =>
          row.original.kind === "block" ? (
            <input
              type="number"
              min="1"
              value={row.original.pressure}
              placeholder="مطلوب"
              onChange={(e) => onUpdateRow(row.original.key, { pressure: e.target.value })}
              className="w-16 px-2 py-1.5 border border-app-separator rounded-lg bg-app-bg-secondary text-xs font-mono focus:border-app-accent focus:outline-none"
            />
          ) : row.original.kind === "separator" || row.original.kind === "head" ? (
            <input
              type="number"
              min="1"
              value={row.original.pressure}
              placeholder="اختياري"
              onChange={(e) => onUpdateRow(row.original.key, { pressure: e.target.value })}
              className="w-16 px-2 py-1.5 border border-app-separator rounded-lg bg-app-bg-secondary text-xs font-mono focus:border-app-accent focus:outline-none"
            />
          ) : (
            <span className="text-app-label-tertiary">—</span>
          ),
      },
      {
        id: "grade",
        header: "الدرجة",
        cell: ({ row }) =>
          row.original.kind !== "scrap" ? (
            <select
              value={row.original.grade}
              onChange={(e) => onUpdateRow(row.original.key, { grade: e.target.value as DraftRow["grade"] })}
              className="px-2 py-1.5 border border-app-separator rounded-lg bg-app-bg-secondary text-xs focus:border-app-accent focus:outline-none"
            >
              <option value="standard">قياسي</option>
              <option value="acceptable_variant">متغيّر مقبول</option>
              <option value="defective_usable">معيب قابل للاستخدام</option>
              <option value="reject">مرفوض</option>
            </select>
          ) : (
            <span className="text-app-label-tertiary">—</span>
          ),
      },
      {
        id: "color",
        header: "اللون",
        cell: ({ row }) =>
          row.original.kind !== "scrap" ? (
            <input
              type="text"
              value={row.original.color}
              onChange={(e) => onUpdateRow(row.original.key, { color: e.target.value })}
              className="w-20 px-2 py-1.5 border border-app-separator rounded-lg bg-app-bg-secondary text-xs focus:border-app-accent focus:outline-none"
            />
          ) : (
            <span className="text-app-label-tertiary">—</span>
          ),
      },
      {
        id: "unit_cost",
        header: "تكلفة الوحدة",
        cell: ({ row }) =>
          row.original.kind !== "scrap" ? (
            <input
              type="number"
              step="0.01"
              min="0"
              value={row.original.unit_cost}
              onChange={(e) => onUpdateRow(row.original.key, { unit_cost: e.target.value })}
              className="w-24 px-2 py-1.5 border border-app-separator rounded-lg bg-app-bg-secondary text-xs font-mono focus:border-app-accent focus:outline-none"
            />
          ) : (
            <span className="text-app-label-tertiary">—</span>
          ),
      },
      {
        id: "volume",
        header: "الحجم (م³)",
        meta: { align: "end", className: "font-mono text-app-label-secondary" },
        cell: ({ row }) => (
          <>
            <div className="font-bold text-app-label-primary">{rowTotal(row.original).toFixed(4)}</div>
            <div className="text-[10px]">{rowVolume(row.original).toFixed(4)} لكل واحدة</div>
          </>
        ),
      },
      {
        id: "row_actions",
        header: "",
        meta: { export: false, align: "end" },
        cell: ({ row }) =>
          rowsCount > 1 ? (
            <button
              onClick={() => onRemoveRow(row.original.key)}
              className="p-1.5 rounded-lg text-app-label-tertiary hover:bg-app-fill-f1 hover:text-app-status-danger transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          ) : null,
      },
    ],
    // rowTotal/rowVolume close over `batch`, onUpdateRow closes over setRows — both are stable
    // enough per render; rowsCount gates the delete button visibility.
    [rowsCount, rowTotal, rowVolume, onUpdateRow, onRemoveRow],
  );
}
