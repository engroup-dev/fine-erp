import { useMemo } from "react";
import { Plus, X, Scissors, Factory, ShoppingCart } from "lucide-react";
import { ColumnDef } from "../ui/DataTable";
import { RowActionsMenu, RowActionItem } from "../ui/RowActionsMenu";
import {
  MaterialRequest,
  MaterialRequestModule,
  MaterialRequestStatus,
} from "../../api/endpoints/materials";
import { cn } from "../../lib/utils/utils";
import { tokens } from "../../lib/tokens";

export const MODULE_LABEL: Record<MaterialRequestModule, string> = {
  cutter: "Cutter",
  foam: "Foam",
  procurement: "Procurement",
};

const STATUS_STYLE: Record<MaterialRequestStatus, string> = {
  pending: "bg-app-status-yellow/15 text-app-status-yellow",
  in_progress: "bg-app-status-info/15 text-app-status-info",
  fulfilled: "bg-app-status-positive/15 text-app-status-positive",
  cancelled: "bg-app-bg-tertiary text-app-label-tertiary",
};

export const STATUS_LABEL: Record<MaterialRequestStatus, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  fulfilled: "Fulfilled",
  cancelled: "Cancelled",
};

function ModuleIcon({ module }: { module: MaterialRequestModule }) {
  if (module === "cutter") return <Scissors className="h-3.5 w-3.5" />;
  if (module === "foam") return <Factory className="h-3.5 w-3.5" />;
  return <ShoppingCart className="h-3.5 w-3.5" />;
}

export interface UseMaterialRequestsColumnsArgs {
  onStart: (id: string) => void;
  onCancel: (id: string) => void;
  startPending: boolean;
  cancelPending: boolean;
  fulfillPending: boolean;
  fulfillVariables: unknown;
}

export function useMaterialRequestsColumns({
  onStart,
  onCancel,
  startPending,
  cancelPending,
  fulfillPending,
  fulfillVariables,
}: UseMaterialRequestsColumnsArgs): ColumnDef<MaterialRequest, unknown>[] {
  return useMemo<ColumnDef<MaterialRequest, unknown>[]>(
    () => [
      {
        id: "item",
        header: "الصنف",
        meta: { exportValue: (r) => [r.inventory_item?.code, r.inventory_item?.name].filter(Boolean).join(" — ") },
        enableSorting: false,
        cell: ({ row }) => (
          <>
            <div className="font-bold">{row.original.inventory_item?.name ?? "—"}</div>
            <div className="text-[10px] font-mono text-app-label-tertiary">
              {row.original.inventory_item?.code ?? ""}
            </div>
          </>
        ),
      },
      {
        id: "module",
        header: "الوحدة",
        meta: { exportValue: (r) => MODULE_LABEL[r.fulfilling_module] },
        enableSorting: false,
        cell: ({ row }) => (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold bg-app-bg-secondary border border-app-separator",
            )}
          >
            <ModuleIcon module={row.original.fulfilling_module} />
            {MODULE_LABEL[row.original.fulfilling_module]}
          </span>
        ),
      },
      {
        accessorKey: "quantity",
        header: "الكمية",
        meta: { align: "end", className: "font-mono font-bold" },
        cell: ({ row }) => row.original.quantity,
      },
      {
        id: "dimensions",
        header: "الأبعاد المطلوبة",
        enableSorting: false,
        meta: { exportValue: (r) => { const d = r.target_dimensions; return d ? `${d.length_m ?? "-"} × ${d.width_m ?? "-"} × ${d.height_m ?? "-"}` : null; }, className: "font-mono text-[11px] text-app-label-secondary" },
        cell: ({ row }) => {
          const d = row.original.target_dimensions;
          return d
            ? `${d.length_m ?? "-"} × ${d.width_m ?? "-"} × ${d.height_m ?? "-"} م`
            : "—";
        },
      },
      {
        id: "status",
        header: "الحالة",
        meta: { exportValue: (r) => STATUS_LABEL[r.status] },
        enableSorting: false,
        cell: ({ row }) => (
          <span
            className={cn(
              "inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold",
              STATUS_STYLE[row.original.status],
            )}
          >
            {STATUS_LABEL[row.original.status]}
          </span>
        ),
      },
      {
        id: "source",
        header: "المصدر",
        enableSorting: false,
        meta: { exportValue: (r) => (r.requested_for_type && r.requested_for_id ? `${r.requested_for_type}#${r.requested_for_id.slice(0, 8)}` : null), className: "text-[10px] text-app-label-tertiary font-mono" },
        cell: ({ row }) => {
          const r = row.original;
          return r.requested_for_type && r.requested_for_id
            ? `${r.requested_for_type}#${r.requested_for_id.slice(0, 8)}`
            : "—";
        },
      },
      {
        id: "actions",
        header: "الإجراءات",
        enableSorting: false,
        meta: { export: false, align: "end" },
        cell: ({ row }) => {
          const r = row.original;
          const items: RowActionItem[] = [];
          if (r.status === "pending") {
            items.push({ label: "بدء", icon: Plus, onClick: () => onStart(r.id), disabled: startPending });
          }
          if (r.status === "pending" || r.status === "in_progress") {
            items.push({ label: "إلغاء", icon: X, danger: true, onClick: () => onCancel(r.id), disabled: cancelPending });
          }
          return (
            <div className="inline-flex items-center gap-1">
              {items.length > 0 && <RowActionsMenu items={items} />}
              <span
                className={cn(
                  tokens.typography.webUI.c1Regular,
                  "text-[10px] text-app-label-tertiary italic",
                )}
              >
                {fulfillPending && r.id === (fulfillVariables as { id: string } | undefined)?.id
                  ? "..."
                  : ""}
              </span>
            </div>
          );
        },
      },
    ],
    [startPending, cancelPending, fulfillPending, fulfillVariables],
  );
}
