import { useMemo } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { ColumnDef } from "../ui/DataTable";
import {
  LookupConfig,
  LookupEntry,
  lookupFieldLabel,
} from "../../config/referenceLookups";

export interface UseReferenceLookupColumnsArgs {
  config: LookupConfig;
  onEdit: (entry: LookupEntry) => void;
  onDelete: (entry: LookupEntry) => void;
  onToggleActive: (entry: LookupEntry) => void;
}

export function useReferenceLookupColumns({
  config,
  onEdit,
  onDelete,
  onToggleActive,
}: UseReferenceLookupColumnsArgs): ColumnDef<LookupEntry, unknown>[] {
  return useMemo<ColumnDef<LookupEntry, unknown>[]>(
    () => [
      {
        id: "name",
        accessorKey: "name",
        header: config.nameLabel,
        meta: { className: "font-medium" },
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span>{row.original.name}</span>
            {row.original.notes ? (
              <span className="line-clamp-1 text-[11px] text-app-label-tertiary">
                {row.original.notes}
              </span>
            ) : null}
          </div>
        ),
      },
      {
        id: "code",
        accessorKey: "code",
        header: config.codeLabel,
        meta: { className: "font-mono text-app-accent" },
        cell: ({ row }) => row.original.code,
      },
      ...config.fields.map<ColumnDef<LookupEntry, unknown>>((field) => ({
        id: `field-${field.key}`,
        accessorFn: (entry: LookupEntry) => lookupFieldLabel(field, entry.fields),
        header: field.label,
        meta: { className: field.mono ? "font-mono" : undefined },
        cell: ({ row }) => {
          const label = lookupFieldLabel(field, row.original.fields);
          if (field.chip) {
            return (
              <span className="rounded bg-app-accent-subtle px-1.5 py-0.5 text-[10px] font-medium text-app-accent">
                {label}
              </span>
            );
          }
          return label;
        },
      })),
      {
        id: "isActive",
        header: "الحالة",
        meta: { exportValue: (r) => (r.isActive ? "مفعّل" : "موقوف") },
        enableSorting: false,
        cell: ({ row }) => (
          <button
            type="button"
            onClick={() => onToggleActive(row.original)}
            className={
              row.original.isActive
                ? "rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800"
                : "rounded-full bg-app-fill-f1 px-2 py-0.5 text-[10px] font-medium text-app-label-tertiary"
            }
          >
            {row.original.isActive ? "مفعّل" : "موقوف"}
          </button>
        ),
      },
      {
        id: "actions",
        header: "إجراء",
        enableSorting: false,
        meta: { export: false, align: "end" },
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            <button
              type="button"
              onClick={() => onEdit(row.original)}
              className="rounded-lg p-1 text-app-label-secondary transition hover:bg-app-fill-f1 hover:text-app-accent"
              aria-label="تعديل"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(row.original)}
              className="rounded-lg p-1 text-rose-600 transition hover:bg-rose-50"
              aria-label="حذف"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ),
      },
    ],
    [config, onEdit, onDelete, onToggleActive],
  );
}
