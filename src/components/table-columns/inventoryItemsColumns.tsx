import { useMemo } from "react";
import { Pencil, Tags } from "lucide-react";
import { ColumnDef } from "../ui/DataTable";
import { InventoryItem, UOM_LABELS } from "../../api/endpoints/inventory";
import { ITEM_TYPE_LABELS, InventoryItemType } from "../../api/endpoints/categories";
import { formatDate, formatNumber } from "../../lib/utils/format";

export interface UseInventoryItemsColumnsArgs {
  onEdit?: (item: InventoryItem) => void;
}

export function useInventoryItemsColumns({ onEdit }: UseInventoryItemsColumnsArgs = {}): ColumnDef<InventoryItem, unknown>[] {
  return useMemo<ColumnDef<InventoryItem, unknown>[]>(
    () => [
      {
        id: "code",
        accessorKey: "code",
        header: "رمز الصنف",
        meta: { className: "font-mono font-bold text-app-accent" },
        cell: ({ row }) => row.original.code,
      },
      {
        id: "name",
        accessorKey: "name",
        header: "الاسم",
        meta: { className: "font-medium" },
        cell: ({ row }) => row.original.name,
      },
      {
        id: "category",
        header: "الفئة والنوع",
        meta: { exportValue: (i) => [i.category?.name ?? "بدون فئة", ITEM_TYPE_LABELS[i.item_type as InventoryItemType] ?? i.item_type].filter(Boolean).join(" / ") },
        enableSorting: false,
        cell: ({ row }) => {
          const cat = row.original.category;
          const typeLabel =
            ITEM_TYPE_LABELS[row.original.item_type as InventoryItemType] ??
            row.original.item_type;
          return (
            <div className="flex flex-col gap-1 items-start">
              {cat ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full bg-indigo-50 text-indigo-700">
                  <Tags className="w-3 h-3" /> {cat.name}
                </span>
              ) : (
                <span className="text-app-label-tertiary text-xs">بدون فئة</span>
              )}
              {typeLabel && (
                <span className="text-[10px] text-app-label-secondary font-medium px-1.5 py-0.5 rounded bg-app-bg-secondary border border-app-separator">
                  {typeLabel}
                </span>
              )}
            </div>
          );
        },
      },
      {
        id: "uom",
        header: "وحدة القياس والتعبئة",
        enableSorting: false,
        meta: { exportValue: (i) => { const cap = Number(i.container_capacity); const uom = UOM_LABELS[i.unit_of_measure] ?? i.unit_of_measure; return cap > 0 && i.primary_uom ? `1 ${i.primary_uom} = ${cap} ${uom}` : uom; }, className: "font-mono font-medium text-app-label-secondary" },
        cell: ({ row }) => {
          const item = row.original;
          const cap = Number(item.container_capacity);
          const uomLabel = UOM_LABELS[item.unit_of_measure] ?? item.unit_of_measure;
          if (cap > 0 && item.primary_uom) {
            return (
              <div className="flex flex-col">
                <span className="font-semibold text-app-label-primary text-xs">
                  1 {item.primary_uom} = {formatNumber(cap)} {uomLabel}
                </span>
                <span className="text-[10px] text-app-label-tertiary">
                  {item.primary_uom} / {uomLabel}
                </span>
              </div>
            );
          }
          return <span className="font-semibold text-app-label-primary text-xs">{uomLabel}</span>;
        },
      },
      {
        id: "dimensions",
        header: "المقاس",
        enableSorting: false,
        meta: { exportValue: (i) => (!i.length_m && !i.width_m && !i.height_m ? null : `${i.length_m ?? "—"} × ${i.width_m ?? "—"} × ${i.height_m ?? "—"}`), className: "font-mono text-app-label-secondary" },
        cell: ({ row }) => {
          const { length_m, width_m, height_m } = row.original;
          if (!length_m && !width_m && !height_m) {
            return "—";
          }
          return (
            <>
              {length_m ?? "—"}م × {width_m ?? "—"}م × {height_m ?? "—"}م
            </>
          );
        },
      },
      {
        id: "pricing",
        header: "الأسعار (قطاعي / جملة)",
        enableSorting: false,
        meta: { exportAs: [{ header: "سعر القطاعي", value: (i) => (i.selling_price != null ? Number(i.selling_price) : null) }, { header: "سعر الجملة", value: (i) => (i.wholesale_price != null ? Number(i.wholesale_price) : null) }, { header: "سعر التكلفة", value: (i) => (i.cost_price != null ? Number(i.cost_price) : null) }], className: "text-xs" },
        cell: ({ row }) => {
          const item = row.original;
          const retail = item.selling_price !== null && item.selling_price !== undefined ? Number(item.selling_price) : null;
          const wholesale = item.wholesale_price !== null && item.wholesale_price !== undefined ? Number(item.wholesale_price) : null;
          const cost = item.cost_price !== null && item.cost_price !== undefined ? Number(item.cost_price) : null;

          if (retail === null && wholesale === null && cost === null) {
            return <span className="text-app-label-tertiary">—</span>;
          }

          return (
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-1.5 font-mono">
                {retail !== null && (
                  <span className="font-semibold text-app-label-primary" title="سعر بيع القطعة">
                    {formatNumber(retail)} <span className="text-[10px] font-sans text-app-label-tertiary">قطاعي</span>
                  </span>
                )}
                {wholesale !== null && (
                  <span className="text-app-accent font-semibold" title="سعر بيع بالجملة">
                    {formatNumber(wholesale)} <span className="text-[10px] font-sans text-app-label-tertiary">جملة</span>
                  </span>
                )}
              </div>
              {cost !== null && (
                <div className="text-[10px] text-app-label-tertiary font-mono" title="سعر التكلفة">
                  تكلفة: {formatNumber(cost)} د.ل
                </div>
              )}
            </div>
          );
        },
      },
      {
        id: "created_at",
        accessorKey: "created_at",
        header: "تاريخ الإنشاء",
        meta: { className: "text-app-label-tertiary" },
        cell: ({ row }) => formatDate(row.original.created_at),
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        meta: { export: false, align: "end" },
        cell: ({ row }) => {
          const item = row.original;
          return (
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit?.(item);
                }}
                className="flex items-center gap-1 rounded-lg border border-app-separator px-2.5 py-1 text-xs font-semibold text-app-label-secondary hover:border-app-accent hover:text-app-accent hover:bg-app-accent-subtle transition-colors"
                title="تعديل الصنف"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>تعديل</span>
              </button>
            </div>
          );
        },
      },
    ],
    [onEdit]
  );
}

