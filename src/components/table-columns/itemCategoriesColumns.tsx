import { useMemo } from "react";
import { ChevronLeft } from "lucide-react";
import { ColumnDef } from "../ui/DataTable";
import { ITEM_TYPE_LABELS, InventoryItemType, ItemCategory } from "../../api/endpoints/categories";

export interface UseItemCategoriesColumnsArgs {
  onOpen: (category: ItemCategory) => void;
}

export function useItemCategoriesColumns({
  onOpen,
}: UseItemCategoriesColumnsArgs): ColumnDef<ItemCategory, unknown>[] {
  return useMemo<ColumnDef<ItemCategory, unknown>[]>(
    () => [
      {
        id: "name",
        accessorKey: "name",
        header: "الاسم",
        cell: ({ row }) => (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpen(row.original);
            }}
            className="flex items-center gap-1 font-bold text-app-accent hover:underline"
          >
            {row.original.name}
            <ChevronLeft className="h-3 w-3" />
          </button>
        ),
      },
      {
        id: "code",
        accessorKey: "code",
        header: "الرمز",
        meta: { className: "font-mono font-bold text-app-label-primary" },
        cell: ({ row }) => row.original.code,
      },
      {
        id: "item_type",
        header: "نوع الصنف",
        meta: { exportValue: (r) => (r.item_type ? ITEM_TYPE_LABELS[r.item_type as InventoryItemType] ?? r.item_type : null) },
        enableSorting: false,
        cell: ({ row }) => {
          const type = row.original.item_type;
          if (!type) {
            return <span className="text-app-label-tertiary">—</span>;
          }
          return (
            <span className="inline-block rounded bg-app-accent-subtle px-1.5 py-0.5 text-[10px] font-medium text-app-accent">
              {ITEM_TYPE_LABELS[type as InventoryItemType] ?? type}
            </span>
          );
        },
      },
      {
        id: "child_code_length",
        header: "طول رمز الفروع",
        enableSorting: false,
        meta: { exportValue: (r) => r.child_code_length, align: "center", className: "font-mono text-app-label-secondary" },
        cell: ({ row }) => row.original.child_code_length ?? "—",
      },
      {
        id: "description",
        accessorKey: "description",
        header: "الوصف",
        enableSorting: false,
        meta: { className: "text-app-label-secondary" },
        cell: ({ row }) => row.original.description || "—",
      },
    ],
    [onOpen],
  );
}
