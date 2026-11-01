import { useMemo } from "react";
import { ColumnDef } from "../ui/DataTable";
import { Building2, MoreHorizontal } from "lucide-react";
import { OperatingUnit } from "../../types/entities";
import { cn } from "../../lib/utils/utils";

const STATUS_CHIP: Record<string, string> = {
  active: "bg-app-status-positive/15 text-app-status-positive",
  provisioning: "bg-app-status-warning/15 text-app-status-warning",
  inactive: "bg-app-status-danger/15 text-app-status-danger",
};

const STATUS_LABEL: Record<string, string> = {
  active: "نشطة",
  provisioning: "قيد الإعداد",
  inactive: "معطلة",
};

export interface OperatingUnitsColumnOptions {
  onEdit: (unit: OperatingUnit) => void;
  onDelete: (unit: OperatingUnit) => void;
  onRestore: (unit: OperatingUnit) => void;
}

export function useOperatingUnitsColumns(
  options: OperatingUnitsColumnOptions,
): ColumnDef<OperatingUnit, unknown>[] {
  return useMemo<ColumnDef<OperatingUnit, unknown>[]>(
    () => [
      {
        id: "name",
        header: "اسم الوحدة",
        accessorFn: (u) => u.name,
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="font-bold text-app-label-primary">{row.original.name}</span>
            <span className="text-[10px] font-mono text-app-label-secondary">
              {row.original.unit_type ?? "—"}
            </span>
          </div>
        ),
        meta: { className: "font-semibold" },
      },
      {
        id: "blueprint",
        header: "القالب",
        accessorFn: (u) => u.blueprint?.name ?? "",
        cell: ({ row }) => (
          <div className="flex items-center gap-1 text-[11px] text-app-label-secondary">
            <Building2 className="h-3 w-3" />
            <span>{row.original.blueprint?.name ?? "—"}</span>
          </div>
        ),
      },
      {
        id: "status",
        header: "الحالة",
        meta: { exportValue: (u) => STATUS_LABEL[u.status ?? ""] ?? u.status },
        accessorFn: (u) => u.status ?? "",
        cell: ({ row }) => {
          const status = row.original.status ?? "";
          const chip = STATUS_CHIP[status] ?? "bg-app-bg-secondary text-app-label-secondary";
          const label = STATUS_LABEL[status] ?? status;
          return (
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold",
                chip,
              )}
            >
              {label}
            </span>
          );
        },
      },
      {
        id: "manager",
        header: "المسؤول",
        accessorFn: (u) => u.manager?.name ?? "",
        cell: ({ row }) => (
          <span className="text-xs text-app-label-primary">
            {row.original.manager?.name ?? "—"}
          </span>
        ),
      },
      {
        id: "created_at",
        header: "تاريخ الإنشاء",
        accessorFn: (u) => u.created_at ?? "",
        cell: ({ row }) => (
          <span className="text-[11px] text-app-label-secondary">
            {row.original.created_at
              ? new Date(row.original.created_at).toLocaleDateString("ar-LY")
              : "—"}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => {
          const isDeleted = Boolean(row.original.deleted_at);
          return (
            <div className="flex items-center justify-end gap-2">
              {isDeleted ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    options.onRestore(row.original);
                  }}
                  className="rounded-lg border border-app-accent/40 bg-app-accent/10 px-2 py-1 text-[11px] font-bold text-app-accent hover:bg-app-accent/20"
                >
                  استعادة
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      options.onEdit(row.original);
                    }}
                    className="rounded-lg border border-app-separator bg-app-bg-secondary px-2 py-1 text-[11px] font-semibold text-app-label-primary hover:bg-app-fill-f1"
                  >
                    تعديل
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      options.onDelete(row.original);
                    }}
                    className="rounded-lg border border-app-status-danger/30 bg-app-status-danger/10 px-2 py-1 text-[11px] font-semibold text-app-status-danger hover:bg-app-status-danger/20"
                  >
                    حذف
                  </button>
                </>
              )}
              <MoreHorizontal className="h-4 w-4 text-app-label-tertiary" />
            </div>
          );
        },
        meta: { export: false, className: "w-1" },
      },
    ],
    [options],
  );
}
