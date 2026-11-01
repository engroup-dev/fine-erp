import { useMemo } from "react";
import { ColumnDef } from "../ui/DataTable";
import { formatNumber } from "../../lib/utils/format";
import { PurchaseOrder, LandedCostLine } from "../../types/procurement";
import { OperatingUnit } from "../../types/entities";
import {
  useApproveLandedCostLine,
  useMarkLandedCostLinePaid,
} from "../../hooks/useProcurement";
import { AllocationPaymentActions, ALLOCATION_STATUS_LABEL } from "../allocations/AllocationPaymentActions";

export interface UsePurchaseOrderLandedCostColumnsArgs {
  selectedOrder: PurchaseOrder | null;
  operatingUnits: OperatingUnit[];
  approveLandedCostMutation: ReturnType<typeof useApproveLandedCostLine>;
  markLandedCostPaidMutation: ReturnType<typeof useMarkLandedCostLinePaid>;
  lineError: Record<string, string>;
  onApprove: (line: LandedCostLine, note: string) => void;
  onMarkPaid: (line: LandedCostLine, note: string) => void;
}

export function usePurchaseOrderLandedCostColumns({
  selectedOrder,
  operatingUnits,
  approveLandedCostMutation,
  markLandedCostPaidMutation,
  lineError,
  onApprove,
  onMarkPaid,
}: UsePurchaseOrderLandedCostColumnsArgs): ColumnDef<LandedCostLine, unknown>[] {
  return useMemo<ColumnDef<LandedCostLine, unknown>[]>(
    () => [
      {
        id: "type",
        header: "نوع التكلفة",
        cell: ({ row }) => row.original.type,
        meta: { exportValue: (r) => r.type, className: "font-semibold" },
      },
      {
        id: "amount",
        header: "المبلغ",
        cell: ({ row }) => `${formatNumber(row.original.amount)} ${row.original.currency}`,
        meta: { exportAs: [{ header: "المبلغ", value: (r) => Number(r.amount) }, { header: "العملة", value: (r) => r.currency }], className: "font-mono font-bold" },
      },
      {
        id: "note",
        header: "الملاحظة",
        cell: ({ row }) => row.original.note || "—",
        meta: { exportValue: (r) => r.note, className: "text-app-label-secondary max-w-xs truncate" },
      },
      {
        id: "responsible",
        header: "المسؤول",
        cell: ({ row }) => row.original.payer?.name ?? row.original.approver?.name ?? "—",
        meta: { exportValue: (r) => r.payer?.name ?? r.approver?.name, className: "text-app-label-secondary" },
      },
      {
        id: "status_action",
        header: "الحالة والإجراء",
        enableSorting: false,
        meta: { exportValue: (r) => ALLOCATION_STATUS_LABEL[r.status] ?? r.status, align: "end" },
        cell: ({ row }) => {
          const lc = row.original;
          const orderUnitId = selectedOrder?.operating_unit_id;
          const unit = operatingUnits.find((u) => u.id === orderUnitId);
          const managerId = unit?.manager_user_id ?? null;
          return (
            <AllocationPaymentActions
              status={lc.status}
              managerId={managerId}
              isPending={
                approveLandedCostMutation.isPending &&
                approveLandedCostMutation.variables?.lineId === lc.id
              }
              isMarkingPaid={
                markLandedCostPaidMutation.isPending &&
                markLandedCostPaidMutation.variables?.lineId === lc.id
              }
              errorMessage={lineError[lc.id] ?? null}
              onApprove={(note) => selectedOrder && onApprove(lc, note)}
              onMarkPaid={(note) => selectedOrder && onMarkPaid(lc, note)}
            />
          );
        },
      },
    ],
    [selectedOrder, operatingUnits, approveLandedCostMutation, markLandedCostPaidMutation, lineError, onApprove, onMarkPaid]
  );
}
