import { useMemo } from "react";
import { Edit2, Trash2 } from "lucide-react";
import { ATTENDANCE_STATUS_LABEL, type Attendance, type AttendanceStatus } from "../../api/endpoints/hr";
import { ColumnDef } from "../ui/DataTable";

export interface UseAttendanceRecordsColumnsArgs {
  onEdit: (record: Attendance) => void;
  onDelete: (record: Attendance) => void;
}

export const ATTENDANCE_BADGE_STYLE: Record<AttendanceStatus, string> = {
  present: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20",
  absent: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20",
  half_day: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20",
  leave: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20",
};

export function useAttendanceRecordsColumns({
  onEdit,
  onDelete,
}: UseAttendanceRecordsColumnsArgs): ColumnDef<Attendance, unknown>[] {
  return useMemo<ColumnDef<Attendance, unknown>[]>(
    () => [
      {
        id: "work_date",
        accessorKey: "work_date",
        header: "التاريخ",
        meta: { className: "font-mono font-bold text-app-label-primary whitespace-nowrap" },
        cell: ({ row }) => {
          const raw = row.original.work_date;
          return raw ? raw.slice(0, 10) : "—";
        },
      },
      {
        id: "employee",
        header: "الموظف",
        accessorFn: (a) => a.employee?.entity?.name ?? a.employee?.job_title ?? a.employee_id,
        meta: { className: "font-bold text-app-label-primary" },
        cell: ({ row }) => {
          const emp = row.original.employee;
          return emp?.entity?.name ?? emp?.job_title ?? row.original.employee_id.slice(0, 8);
        },
      },
      {
        id: "job_title",
        header: "الوظيفة",
        accessorFn: (a) => a.employee?.job_title ?? "—",
        meta: { className: "text-app-label-secondary text-xs" },
        cell: ({ row }) => row.original.employee?.job_title ?? "—",
      },
      {
        id: "status",
        accessorKey: "status",
        header: "الحالة",
        meta: { exportValue: (a) => ATTENDANCE_STATUS_LABEL[a.status] ?? a.status },
        cell: ({ row }) => {
          const status = row.original.status;
          const label = ATTENDANCE_STATUS_LABEL[status] ?? status;
          const style = ATTENDANCE_BADGE_STYLE[status] ?? "bg-app-fill-f1 text-app-label-secondary";
          return (
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${style}`}>
              {label}
            </span>
          );
        },
      },
      {
        id: "hours_worked",
        accessorKey: "hours_worked",
        header: "ساعات العمل",
        meta: { className: "font-mono" },
        cell: ({ row }) => {
          const hours = Number(row.original.hours_worked);
          return hours > 0 ? `${hours} س` : "—";
        },
      },
      {
        id: "overtime_hours",
        header: "إضافي",
        accessorFn: (a) => Number(a.overtime_hours ?? 0),
        meta: { className: "font-mono" },
        cell: ({ row }) => {
          const overtime = Number(row.original.overtime_hours ?? 0);
          return overtime > 0 ? `${overtime} س` : "—";
        },
      },
      {
        id: "notes",
        accessorKey: "notes",
        header: "الملاحظات",
        meta: { className: "text-app-label-secondary text-xs max-w-xs truncate" },
        cell: ({ row }) => row.original.notes || "—",
      },
      {
        id: "actions",
        header: "الإجراءات",
        enableSorting: false,
        meta: { export: false, align: "end" },
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1.5">
            <button
              onClick={() => onEdit(row.original)}
              title="تعديل السجل"
              className="p-1.5 rounded-lg border border-app-separator text-app-label-secondary hover:text-app-accent hover:border-app-accent hover:bg-app-accent-subtle transition-colors"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onDelete(row.original)}
              title="حذف السجل"
              className="p-1.5 rounded-lg border border-app-separator text-app-label-secondary hover:text-app-status-danger hover:border-app-status-danger hover:bg-app-status-danger/10 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ),
      },
    ],
    [onEdit, onDelete],
  );
}
