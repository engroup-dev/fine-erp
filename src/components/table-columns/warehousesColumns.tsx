import { useMemo } from "react";
import { ColumnDef } from "../ui/DataTable";
import { Warehouse } from "../../types/entities";

export function useWarehousesColumns(): ColumnDef<Warehouse, unknown>[] {
  return useMemo<ColumnDef<Warehouse, unknown>[]>(
    () => [
      {
        id: "name",
        accessorKey: "name",
        header: "المخزن",
        meta: { className: "font-bold text-app-label-primary" },
        cell: ({ row }) => row.original.name,
      },
      {
        id: "type",
        header: "النوع",
        meta: { exportValue: (r) => (r.is_internal_unit ? "مخزن داخلي" : "مخزن خارجي") },
        enableSorting: false,
        cell: ({ row }) => (
          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-app-fill-f1 text-app-label-secondary">
            {row.original.is_internal_unit ? "مخزن داخلي" : "مخزن خارجي"}
          </span>
        ),
      },
    ],
    [],
  );
}
