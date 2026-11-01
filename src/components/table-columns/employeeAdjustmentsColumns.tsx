import React, { useMemo } from "react";
import { ColumnDef } from "../ui/DataTable";
import {
  ADJUSTMENT_KIND_LABEL,
  ADJUSTMENT_STATUS_LABEL,
  formatPayMoney,
  type EmployeeAdjustment,
  type EmployeeAdjustmentStatus,
  type PayItemKind,
} from "../../api/endpoints/payItems";

const STATUS_STYLE: Record<EmployeeAdjustmentStatus, string> = {
  draft: "bg-app-status-yellow/15 text-app-status-yellow",
  approved: "bg-app-status-positive/10 text-app-status-positive",
};

export const AdjustmentStatusChip: React.FC<{ status: EmployeeAdjustmentStatus }> = ({ status }) => (
  <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLE[status]}`}>
    {ADJUSTMENT_STATUS_LABEL[status] ?? status}
  </span>
);

export interface UseEmployeeAdjustmentsColumnsArgs {
  /** Off on the employee card, where every row is the same employee. */
  showEmployee: boolean;
  nameOf: (kind: PayItemKind, code: string) => string;
  renderActions: (adjustment: EmployeeAdjustment) => React.ReactNode;
}

/** W5-03: the one-off rewards and deductions list. */
export function useEmployeeAdjustmentsColumns({
  showEmployee,
  nameOf,
  renderActions,
}: UseEmployeeAdjustmentsColumnsArgs): ColumnDef<EmployeeAdjustment, unknown>[] {
  return useMemo<ColumnDef<EmployeeAdjustment, unknown>[]>(
    () => [
      ...(showEmployee
        ? [
            {
              id: "employee",
              header: "الموظف",
              meta: { exportValue: (a: EmployeeAdjustment) => [a.employee?.name, a.employee?.employee_number].filter(Boolean).join(" ") },
              cell: ({ row }: { row: { original: EmployeeAdjustment } }) => (
                <div className="flex flex-col">
                  <span className="font-bold text-app-label-primary">
                    {row.original.employee?.name ?? row.original.employee_id.slice(0, 8)}
                  </span>
                  {row.original.employee?.employee_number && (
                    <span className="font-mono text-[10px] text-app-label-secondary">{row.original.employee.employee_number}</span>
                  )}
                </div>
              ),
            } satisfies ColumnDef<EmployeeAdjustment, unknown>,
          ]
        : []),
      {
        id: "period",
        header: "الشهر",
        meta: { exportValue: (a) => a.period, className: "font-mono" },
        cell: ({ row }) => row.original.period,
      },
      {
        id: "kind",
        header: "النوع",
        meta: { exportValue: (a) => ADJUSTMENT_KIND_LABEL[a.kind] },
        cell: ({ row }) => (
          <span
            className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-bold ${
              row.original.kind === "addition"
                ? "bg-app-status-positive/10 text-app-status-positive"
                : "bg-app-status-danger/10 text-app-status-danger"
            }`}
          >
            {ADJUSTMENT_KIND_LABEL[row.original.kind]}
          </span>
        ),
      },
      {
        id: "code",
        header: "البند",
        meta: { exportValue: (a) => nameOf(a.kind, a.code) },
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="text-app-label-primary">{nameOf(row.original.kind, row.original.code)}</span>
            <span className="font-mono text-[10px] text-app-label-tertiary">{row.original.code}</span>
          </div>
        ),
      },
      {
        id: "amount",
        header: "المبلغ",
        meta: { exportValue: (a) => (a.kind === "deduction" ? -Number(a.amount) : Number(a.amount)), align: "end", className: "font-mono font-bold" },
        cell: ({ row }) => `${row.original.kind === "deduction" ? "−" : "+"}${formatPayMoney(row.original.amount)}`,
      },
      {
        id: "reason",
        header: "السبب",
        meta: { exportValue: (a) => a.reason, className: "text-app-label-secondary" },
        cell: ({ row }) => row.original.reason,
      },
      {
        id: "status",
        header: "الحالة",
        meta: { exportValue: (a) => ADJUSTMENT_STATUS_LABEL[a.status] ?? a.status },
        cell: ({ row }) => (
          <div className="flex flex-col items-start gap-0.5">
            <AdjustmentStatusChip status={row.original.status} />
            {row.original.approved_by && (
              <span className="text-[10px] text-app-label-tertiary">اعتمدها: {row.original.approved_by.name}</span>
            )}
          </div>
        ),
      },
      {
        id: "created_by",
        header: "أدخلها",
        meta: { exportValue: (a) => a.created_by?.name, className: "text-app-label-secondary" },
        cell: ({ row }) => row.original.created_by?.name ?? "—",
      },
      {
        id: "actions",
        header: "",
        meta: { export: false },
        enableSorting: false,
        cell: ({ row }) => renderActions(row.original),
      },
    ],
    [showEmployee, nameOf, renderActions],
  );
}
