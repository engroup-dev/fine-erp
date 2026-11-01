import { useMemo } from "react";
import { KeyRound } from "lucide-react";
import { ColumnDef } from "../ui/DataTable";
import { Entity } from "../../types/entities";

export interface UseAdminEntitiesColumnsArgs {
  onProvision: (entity: Entity) => void;
}

export function useAdminEntitiesColumns({
  onProvision,
}: UseAdminEntitiesColumnsArgs): ColumnDef<Entity, unknown>[] {
  return useMemo<ColumnDef<Entity, unknown>[]>(
    () => [
      {
        accessorKey: "name",
        header: "اسم الكيان",
        meta: { className: "font-semibold" },
        cell: ({ row }) => row.original.name,
      },
      {
        accessorKey: "entity_type",
        header: "النوع",
        meta: { exportValue: (r) => (r.entity_type === "organization" ? "شركة" : "فرد"), className: "text-app-label-secondary" },
        cell: ({ row }) => (row.original.entity_type === "organization" ? "شركة" : "فرد"),
      },
      {
        accessorKey: "tax_number",
        header: "الرقم الضريبي",
        meta: { className: "font-mono text-app-label-secondary" },
        cell: ({ row }) => row.original.tax_number || "-",
      },
      {
        id: "user_account",
        header: "حساب النظام",
        meta: { exportValue: (r) => (r.user_id ? "مربوط" : "بدون حساب") },
        accessorFn: (entity) => Boolean(entity.user_id),
        cell: ({ row }) =>
          row.original.user_id ? (
            <span className="rounded-full bg-app-status-positive/15 px-2 py-0.5 text-[10px] font-bold text-app-status-positive">
              مربوط
            </span>
          ) : (
            <span className="rounded-full bg-app-status-warning/15 px-2 py-0.5 text-[10px] font-bold text-app-status-warning">
              بدون حساب
            </span>
          ),
      },
      {
        id: "actions",
        header: "إجراءات",
        enableSorting: false,
        meta: { export: false, align: "end" },
        cell: ({ row }) => {
          const entity = row.original;
          if (entity.user_id) return null;
          return (
            <button
              type="button"
              onClick={() => onProvision(entity)}
              className="inline-flex items-center gap-1 rounded-lg border border-app-separator bg-app-bg-secondary px-2.5 py-1 text-[11px] font-semibold text-app-label-primary hover:bg-app-fill-f1"
            >
              <KeyRound className="h-3 w-3 text-app-accent" />
              <span>تزويد حساب</span>
            </button>
          );
        },
      },
    ],
    [onProvision]
  );
}
