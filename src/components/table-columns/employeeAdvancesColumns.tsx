import React, { useMemo } from "react";
import { ColumnDef } from "../ui/DataTable";
import {
  ADVANCE_STATUS_LABEL,
  ADVANCE_TYPE_LABEL,
  formatAdvanceMoney,
  type EmployeeAdvance,
  type EmployeeAdvanceStatus,
} from "../../api/endpoints/employeeAdvances";

export const ADVANCE_STATUS_STYLE: Record<EmployeeAdvanceStatus, string> = {
  requested: "bg-app-status-yellow/15 text-app-status-yellow",
  approved: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  paid: "bg-app-accent/10 text-app-accent",
  settled: "bg-app-status-positive/10 text-app-status-positive",
  cancelled: "bg-app-fill-f1 text-app-label-tertiary",
};

export const AdvanceStatusChip: React.FC<{ status: EmployeeAdvanceStatus }> = ({ status }) => (
  <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold ${ADVANCE_STATUS_STYLE[status]}`}>
    {ADVANCE_STATUS_LABEL[status] ?? status}
  </span>
);

export interface UseEmployeeAdvancesColumnsArgs {
  /** Off on the employee card, where every row is the same employee. */
  showEmployee: boolean;
  renderActions: (advance: EmployeeAdvance) => React.ReactNode;
}

export function useEmployeeAdvancesColumns({
  showEmployee,
  renderActions,
}: UseEmployeeAdvancesColumnsArgs): ColumnDef<EmployeeAdvance, unknown>[] {
  return useMemo<ColumnDef<EmployeeAdvance, unknown>[]>(
    () => [
      ...(showEmployee
        ? [
            {
              id: "employee",
              header: "الموظف",
              accessorFn: (a: EmployeeAdvance) => `${a.employee?.name ?? ""} ${a.employee?.employee_number ?? ""}`,
              cell: ({ row }: { row: { original: EmployeeAdvance } }) => (
                <div className="flex flex-col">
                  <span className="font-bold text-app-label-primary">
                    {row.original.employee?.name ?? row.original.employee_id.slice(0, 8)}
                  </span>
                  <span className="text-[10px] text-app-label-secondary">
                    {row.original.employee?.employee_number && (
                      <span className="font-mono">{row.original.employee.employee_number}</span>
                    )}
                    {row.original.employee?.deleted_at && (
                      <span className="ms-1 text-app-status-danger">(محذوف)</span>
                    )}
                  </span>
                </div>
              ),
            } satisfies ColumnDef<EmployeeAdvance, unknown>,
          ]
        : []),
      {
        id: "type",
        header: "النوع",
        accessorFn: (a) => ADVANCE_TYPE_LABEL[a.type] ?? a.type,
        meta: { className: "text-app-label-secondary" },
      },
      {
        accessorKey: "amount",
        header: "المبلغ",
        meta: { align: "end", className: "font-mono font-bold" },
        cell: ({ row }) => formatAdvanceMoney(row.original.amount),
      },
      {
        id: "installments",
        header: "الأقساط",
        accessorFn: (a) => a.installments,
        meta: { className: "font-mono text-app-label-secondary" },
        cell: ({ row }) => `${row.original.installments} × ${formatAdvanceMoney(row.original.monthly_amount)}`,
      },
      {
        accessorKey: "start_period",
        header: "بداية الاسترداد",
        meta: { className: "font-mono text-app-label-secondary" },
      },
      {
        id: "outstanding",
        header: "المتبقي",
        accessorFn: (a) => a.outstanding ?? 0,
        meta: { exportValue: (a) => (a.status === "paid" || a.status === "settled" ? a.outstanding ?? 0 : null), align: "end", className: "font-mono" },
        cell: ({ row }) =>
          row.original.status === "paid" || row.original.status === "settled"
            ? formatAdvanceMoney(row.original.outstanding ?? 0)
            : "—",
      },
      {
        accessorKey: "status",
        header: "الحالة",
        meta: { exportValue: (a) => ADVANCE_STATUS_LABEL[a.status] ?? a.status },
        cell: ({ row }) => <AdvanceStatusChip status={row.original.status} />,
      },
      {
        id: "actions",
        header: "",
        meta: { export: false },
        enableSorting: false,
        cell: ({ row }) => renderActions(row.original),
      },
    ],
    [showEmployee, renderActions],
  );
}
