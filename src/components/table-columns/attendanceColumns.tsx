import { useMemo } from "react";
import { ATTENDANCE_STATUS_LABEL, isPayableAttendance, type AttendanceStatus } from "../../api/endpoints/hr";
import { Employee } from "../../types/entities";
import { ColumnDef } from "../ui/DataTable";

export interface RowState {
  status: AttendanceStatus;
  hours: string;
  /** HR-14: overtime hours on top of the hours worked. */
  overtime: string;
}

export interface UseAttendanceColumnsArgs {
  rowFor: (employeeId: string) => RowState;
  onPatch: (employeeId: string, patch: Partial<RowState>) => void;
  rows: Record<string, RowState>;
}

export function useAttendanceColumns({ rowFor, onPatch, rows }: UseAttendanceColumnsArgs): ColumnDef<Employee, unknown>[] {
  return useMemo<ColumnDef<Employee, unknown>[]>(
    () => [
      {
        id: "employee",
        header: "الموظف",
        accessorFn: (e) => e.entity?.name ?? e.job_title,
        meta: { className: "font-bold text-app-label-primary" },
        cell: ({ row }) => row.original.entity?.name ?? row.original.job_title,
      },
      {
        accessorKey: "job_title",
        header: "الوظيفة",
        meta: { className: "text-app-label-secondary" },
        cell: ({ row }) => row.original.job_title,
      },
      {
        id: "status",
        header: "الحالة",
        meta: { exportValue: (e) => ATTENDANCE_STATUS_LABEL[rowFor(e.id).status] },
        enableSorting: false,
        cell: ({ row }) => {
          const employee = row.original;
          const rowState = rowFor(employee.id);
          return (
            <select
              value={rowState.status}
              onChange={(e) => onPatch(employee.id, { status: e.target.value as AttendanceStatus })}
              className="rounded-lg border border-app-separator bg-app-bg-secondary px-2 py-1.5 text-xs focus:border-app-accent focus:outline-none"
            >
              {(Object.keys(ATTENDANCE_STATUS_LABEL) as AttendanceStatus[]).map((s) => (
                <option key={s} value={s}>{ATTENDANCE_STATUS_LABEL[s]}</option>
              ))}
            </select>
          );
        },
      },
      {
        id: "hours",
        header: "الساعات",
        meta: { exportValue: (e) => (isPayableAttendance(rowFor(e.id).status) ? rowFor(e.id).hours : "0") },
        enableSorting: false,
        cell: ({ row }) => {
          const employee = row.original;
          const rowState = rowFor(employee.id);
          const payable = isPayableAttendance(rowState.status);
          return (
            <input
              type="number" step="0.5" min="0" max="24"
              value={payable ? rowState.hours : "0"}
              disabled={!payable}
              onChange={(e) => onPatch(employee.id, { hours: e.target.value })}
              className="w-20 rounded-lg border border-app-separator bg-app-bg-secondary px-2 py-1.5 text-xs font-mono focus:border-app-accent focus:outline-none disabled:opacity-40"
            />
          );
        },
      },
      {
        id: "overtime",
        header: "إضافي",
        meta: { exportValue: (e) => (isPayableAttendance(rowFor(e.id).status) ? rowFor(e.id).overtime : "0") },
        enableSorting: false,
        cell: ({ row }) => {
          const employee = row.original;
          const rowState = rowFor(employee.id);
          // HR-14: overtime only on a day at work, and hours + overtime ≤ 24.
          const payable = isPayableAttendance(rowState.status);
          const overLimit = payable && (Number(rowState.hours) || 0) + (Number(rowState.overtime) || 0) > 24;
          return (
            <input
              type="number" step="0.5" min="0" max="24"
              value={payable ? rowState.overtime : "0"}
              disabled={!payable}
              title={overLimit ? "مجموع ساعات العمل والإضافي لا يتجاوز 24 ساعة" : "ساعات إضافية فوق ساعات العمل"}
              onChange={(e) => onPatch(employee.id, { overtime: e.target.value })}
              className={`w-20 rounded-lg border bg-app-bg-secondary px-2 py-1.5 text-xs font-mono focus:border-app-accent focus:outline-none disabled:opacity-40 ${
                overLimit ? "border-app-status-danger" : "border-app-separator"
              }`}
            />
          );
        },
      },
    ],
    [rows],
  );
}
