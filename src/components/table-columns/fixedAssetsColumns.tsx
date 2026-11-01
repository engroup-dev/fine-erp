import { useMemo } from "react";
import { CalendarClock, PackageX, Play, Wrench } from "lucide-react";
import { ColumnDef } from "../ui/DataTable";
import { RowActionsMenu, RowActionItem } from "../ui/RowActionsMenu";
import {
  ASSET_STATUS_LABEL,
  DEPRECIATION_METHOD_LABEL,
  type FixedAsset,
} from "../../api/endpoints/fixedAssets";
import { formatNumber } from "../../lib/utils/format";

const STATUS_STYLE: Record<FixedAsset["status"], string> = {
  active: "bg-app-status-positive/10 text-app-status-positive",
  under_maintenance: "bg-app-status-yellow/15 text-app-status-yellow",
  disposed: "bg-app-fill-f1 text-app-label-tertiary",
};

export interface UseFixedAssetsColumnsArgs {
  period: string;
  isDepreciating: boolean;
  bookValue: (asset: FixedAsset) => number;
  onDepreciate: (asset: FixedAsset) => void;
  onTransition: (id: string, status: "active" | "under_maintenance") => void;
  onOpenDispose: (asset: FixedAsset) => void;
  onToggleSchedule: (asset: FixedAsset) => void;
}

export function useFixedAssetsColumns({
  period,
  isDepreciating,
  bookValue,
  onDepreciate,
  onTransition,
  onOpenDispose,
  onToggleSchedule,
}: UseFixedAssetsColumnsArgs): ColumnDef<FixedAsset, unknown>[] {
  return useMemo<ColumnDef<FixedAsset, unknown>[]>(
    () => [
      {
        accessorKey: "asset_code",
        header: "الرمز",
        cell: ({ row }) => (
          <span className="font-mono font-bold text-app-accent">{row.original.asset_code}</span>
        ),
      },
      {
        accessorKey: "name",
        header: "الأصل",
        cell: ({ row }) => <span className="text-app-label-primary">{row.original.name}</span>,
      },
      {
        id: "unit",
        header: "الوحدة",
        accessorFn: (a) => a.operating_unit?.name ?? "الشركة",
        cell: ({ row }) => (
          <span className="text-app-label-secondary">{row.original.operating_unit?.name ?? "الشركة"}</span>
        ),
      },
      {
        id: "method",
        header: "الطريقة",
        accessorFn: (a) => DEPRECIATION_METHOD_LABEL[a.depreciation_method],
        cell: ({ row }) => (
          <span className="text-app-label-secondary">
            {DEPRECIATION_METHOD_LABEL[row.original.depreciation_method]}
          </span>
        ),
      },
      {
        id: "acquisition_cost",
        header: "التكلفة",
        accessorFn: (a) => Number(a.acquisition_cost),
        meta: { align: "end" },
        cell: ({ row }) => <span className="font-mono">{formatNumber(row.original.acquisition_cost)}</span>,
      },
      {
        id: "accumulated_depreciation",
        header: "مجمع الإهلاك",
        accessorFn: (a) => Number(a.accumulated_depreciation),
        meta: { align: "end" },
        cell: ({ row }) => (
          <span className="font-mono">{formatNumber(row.original.accumulated_depreciation)}</span>
        ),
      },
      {
        id: "book_value",
        header: "القيمة الدفترية",
        accessorFn: (a) => bookValue(a),
        meta: { align: "end" },
        cell: ({ row }) => (
          <span className="font-mono font-bold">{formatNumber(bookValue(row.original))}</span>
        ),
      },
      {
        id: "status",
        header: "الحالة",
        meta: { exportValue: (a) => ASSET_STATUS_LABEL[a.status] },
        enableSorting: false,
        cell: ({ row }) => (
          <span className={`px-2 py-1 text-[10px] font-bold rounded-full ${STATUS_STYLE[row.original.status]}`}>
            {ASSET_STATUS_LABEL[row.original.status]}
          </span>
        ),
      },
      {
        id: "actions",
        header: "إجراءات",
        enableSorting: false,
        meta: { export: false, align: "end" },
        cell: ({ row }) => {
          const asset = row.original;
          const items: RowActionItem[] = [];
          if (asset.status === "active") {
            items.push({
              label: `إهلاك ${period}`,
              onClick: () => onDepreciate(asset),
              disabled: isDepreciating,
            });
            items.push({
              label: "إيقاف للصيانة",
              icon: Wrench,
              onClick: () => onTransition(asset.id, "under_maintenance"),
            });
          }
          if (asset.status === "under_maintenance") {
            items.push({
              label: "إعادة تشغيل",
              icon: Play,
              onClick: () => onTransition(asset.id, "active"),
            });
          }
          if (asset.status !== "disposed") {
            items.push({
              label: "استبعاد",
              icon: PackageX,
              danger: true,
              onClick: () => onOpenDispose(asset),
            });
          }
          items.push({
            label: "جدول الإهلاك",
            icon: CalendarClock,
            onClick: () => onToggleSchedule(asset),
          });
          return <RowActionsMenu items={items} />;
        },
      },
    ],
    [period, isDepreciating, bookValue, onDepreciate, onTransition, onOpenDispose, onToggleSchedule],
  );
}
