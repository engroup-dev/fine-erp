import React, { useEffect, useMemo, useState } from "react";
import {
  CalendarCheck2,
  List,
  AlertTriangle,
  Save,
  Plus,
  RefreshCw,
  UserCheck,
  UserX,
  Clock,
  CheckCircle2,
  Calendar,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  useAttendance,
  useSaveAttendance,
  useCreateAttendance,
  useUpdateAttendance,
  useDeleteAttendance,
} from "../../hooks/useHr";
import { getEmployees } from "../../api/endpoints/employees";
import {
  ATTENDANCE_STATUS_LABEL,
  attendanceDayError,
  attendanceErrorMessage,
  isPayableAttendance,
  type Attendance,
  type AttendanceStatus,
} from "../../api/endpoints/hr";
import { Employee } from "../../types/entities";
import { DataTable, useDataTable } from "../../components/ui/DataTable";
import { useAttendanceRecordsColumns } from "../../components/table-columns/attendanceRecordsColumns";
import { useAttendanceColumns, type RowState } from "../../components/table-columns/attendanceColumns";
import { SearchableSelect } from "../../components/ui/SearchableSelect";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "../../components/ui/Dialog";

const DEFAULT_ROW: RowState = { status: "present", hours: "8", overtime: "0" };

const todayIso = () => new Date().toISOString().slice(0, 10);

const getWeekStartIso = () => {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
};

const getMonthStartIso = () => {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
};

export const AttendancePage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"list" | "sheet">("list");

  // Filter states for Attendance List
  const [datePreset, setDatePreset] = useState<"today" | "week" | "month" | "all" | "custom">("month");
  const [fromDate, setFromDate] = useState<string>(getMonthStartIso());
  const [toDate, setToDate] = useState<string>(todayIso());
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [employeeFilter, setEmployeeFilter] = useState<string>("");

  // Daily Sheet states
  const [sheetWorkDate, setSheetWorkDate] = useState<string>(todayIso());
  const [sheetRows, setSheetRows] = useState<Record<string, RowState>>({});
  const [sheetSaved, setSheetSaved] = useState(false);

  // Dialog states
  const [error, setError] = useState<string | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const [selectedRecord, setSelectedRecord] = useState<Attendance | null>(null);

  // Form states for Add Single Record
  const [addEmployeeId, setAddEmployeeId] = useState("");
  const [addWorkDate, setAddWorkDate] = useState(todayIso());
  const [addStatus, setAddStatus] = useState<AttendanceStatus>("present");
  const [addHours, setAddHours] = useState("8");
  const [addOvertime, setAddOvertime] = useState("0");
  const [addNotes, setAddNotes] = useState("");

  // Form states for Edit Record
  const [editStatus, setEditStatus] = useState<AttendanceStatus>("present");
  const [editHours, setEditHours] = useState("8");
  const [editOvertime, setEditOvertime] = useState("0");
  const [editNotes, setEditNotes] = useState("");

  // Queries
  const { data: employees, isLoading: employeesLoading } = useQuery({
    queryKey: ["employees"],
    queryFn: () => getEmployees(),
  });

  // Main attendance list query with filters
  const {
    data: attendanceListData,
    isLoading: listLoading,
    refetch: refetchList,
  } = useAttendance({
    from: fromDate || undefined,
    to: toDate || undefined,
    status: statusFilter || undefined,
    employee_id: employeeFilter || undefined,
    per_page: 200,
  });

  // Query for the daily sheet date
  const {
    data: dailyAttendance,
    isLoading: dailyLoading,
    isSuccess: dailyLoaded,
  } = useAttendance({
    work_date: sheetWorkDate,
    // The whole day: the sheet lists every employee, and a row past the default page of 50
    // would be re-saved from DEFAULT_ROW (status, hours and overtime reset).
    per_page: 1000,
  });

  // Mutations
  const saveSheetMutation = useSaveAttendance();
  const createMutation = useCreateAttendance();
  const updateMutation = useUpdateAttendance();
  const deleteMutation = useDeleteAttendance();

  // Seed daily sheet grid whenever the selected date's attendance arrives
  useEffect(() => {
    if (!dailyAttendance) return;
    const seeded: Record<string, RowState> = {};
    for (const record of dailyAttendance.data) {
      seeded[record.employee_id] = {
        status: record.status,
        hours: String(Number(record.hours_worked)),
        overtime: String(Number(record.overtime_hours ?? 0)),
      };
    }
    setSheetRows(seeded);
    setSheetSaved(false);
  }, [dailyAttendance]);

  // The sheet is saved only once the selected day's records have loaded: every entry sends
  // overtime_hours, so saving earlier would write defaults over that day's recorded hours and overtime.
  const sheetReady = dailyLoaded && dailyAttendance !== undefined;

  const sheetRowFor = (employeeId: string): RowState => sheetRows[employeeId] ?? DEFAULT_ROW;

  const patchSheetRow = (employeeId: string, patch: Partial<RowState>) =>
    setSheetRows((prev) => ({ ...prev, [employeeId]: { ...sheetRowFor(employeeId), ...patch } }));

  const markAllPresent = () => {
    const next: Record<string, RowState> = {};
    for (const emp of employees ?? []) {
      // Overtime already entered on a day at work stays; a hidden value on an absence or leave does not come back.
      const prev = sheetRows[emp.id];
      next[emp.id] = { status: "present", hours: "8", overtime: prev && isPayableAttendance(prev.status) ? prev.overtime : "0" };
    }
    setSheetRows(next);
  };

  const handleDatePreset = (preset: "today" | "week" | "month" | "all" | "custom") => {
    setDatePreset(preset);
    const today = todayIso();
    if (preset === "today") {
      setFromDate(today);
      setToDate(today);
    } else if (preset === "week") {
      setFromDate(getWeekStartIso());
      setToDate(today);
    } else if (preset === "month") {
      setFromDate(getMonthStartIso());
      setToDate(today);
    } else if (preset === "all") {
      setFromDate("");
      setToDate("");
    }
  };

  // Metrics calculation over current attendance list data
  const metrics = useMemo(() => {
    const list = attendanceListData?.data ?? [];
    let presentCount = 0;
    let absentCount = 0;
    let otherCount = 0;
    let totalHours = 0;
    let totalOvertime = 0;

    for (const record of list) {
      if (record.status === "present") presentCount++;
      else if (record.status === "absent") absentCount++;
      else otherCount++;

      totalHours += Number(record.hours_worked) || 0;
      totalOvertime += Number(record.overtime_hours) || 0;
    }

    return {
      totalRecords: list.length,
      presentCount,
      absentCount,
      otherCount,
      totalHours: Math.round(totalHours * 10) / 10,
      totalOvertime: Math.round(totalOvertime * 10) / 10,
    };
  }, [attendanceListData]);

  // Handlers for edit & delete actions
  const openEditModal = (record: Attendance) => {
    setSelectedRecord(record);
    setEditStatus(record.status);
    setEditHours(String(Number(record.hours_worked) || 0));
    setEditOvertime(String(Number(record.overtime_hours) || 0));
    setEditNotes(record.notes || "");
    setError(null);
    setEditDialogOpen(true);
  };

  const openDeleteModal = (record: Attendance) => {
    setSelectedRecord(record);
    setError(null);
    setDeleteDialogOpen(true);
  };

  const handleSaveEdit = () => {
    if (!selectedRecord) return;
    setError(null);

    const payable = isPayableAttendance(editStatus);
    const hours = payable ? Number(editHours) || 0 : 0;
    // HR-14: an absence or leave carries no overtime; sending 0 lets the server accept the change.
    const overtime = payable ? Number(editOvertime) || 0 : 0;
    const dayError = attendanceDayError(editStatus, hours, overtime);
    if (dayError) {
      setError(dayError);
      return;
    }

    updateMutation.mutate(
      {
        id: selectedRecord.id,
        payload: {
          status: editStatus,
          hours_worked: hours,
          overtime_hours: overtime,
          notes: editNotes || undefined,
        },
      },
      {
        onSuccess: () => {
          setEditDialogOpen(false);
          setSelectedRecord(null);
        },
        onError: (err) => setError(attendanceErrorMessage(err, "تعذر تعديل السجل.")),
      },
    );
  };

  const handleConfirmDelete = () => {
    if (!selectedRecord) return;
    setError(null);

    deleteMutation.mutate(selectedRecord.id, {
      onSuccess: () => {
        setDeleteDialogOpen(false);
        setSelectedRecord(null);
      },
      onError: (err) => setError(attendanceErrorMessage(err, "تعذر حذف السجل.")),
    });
  };

  const handleSaveAdd = () => {
    if (!addEmployeeId) {
      setError("يرجى اختيار الموظف.");
      return;
    }
    setError(null);

    const payable = isPayableAttendance(addStatus);
    const hours = payable ? Number(addHours) || 0 : 0;
    const overtime = payable ? Number(addOvertime) || 0 : 0;
    const dayError = attendanceDayError(addStatus, hours, overtime);
    if (dayError) {
      setError(dayError);
      return;
    }

    createMutation.mutate(
      {
        employee_id: addEmployeeId,
        work_date: addWorkDate,
        status: addStatus,
        hours_worked: hours,
        overtime_hours: overtime,
        notes: addNotes || undefined,
      },
      {
        onSuccess: () => {
          setAddDialogOpen(false);
          setAddNotes("");
          setAddOvertime("0");
        },
        onError: (err) => setError(attendanceErrorMessage(err, "تعذر إضافة السجل.")),
      },
    );
  };

  const handleSaveSheet = () => {
    if (!sheetReady) return;
    setError(null);
    setSheetSaved(false);
    const entries = (employees ?? []).map((e) => {
      const row = sheetRowFor(e.id);
      const payable = isPayableAttendance(row.status);
      return {
        employee_id: e.id,
        status: row.status,
        hours_worked: payable ? Number(row.hours) || 0 : 0,
        // HR-14: overtime only on a day at work.
        overtime_hours: payable ? Number(row.overtime) || 0 : 0,
      };
    });
    for (const [i, entry] of entries.entries()) {
      const dayError = attendanceDayError(entry.status, entry.hours_worked, entry.overtime_hours);
      if (dayError) {
        const emp = (employees ?? [])[i];
        setError(`${emp?.entity?.name ?? emp?.job_title ?? ""}: ${dayError}`);
        return;
      }
    }
    saveSheetMutation.mutate(
      { work_date: sheetWorkDate, entries },
      {
        onSuccess: () => setSheetSaved(true),
        onError: (err) => setError(attendanceErrorMessage(err, "تعذر حفظ الكشف.")),
      },
    );
  };

  // Table definitions
  const listColumns = useAttendanceRecordsColumns({
    onEdit: openEditModal,
    onDelete: openDeleteModal,
  });

  const listTableData = useMemo(() => attendanceListData?.data ?? [], [attendanceListData]);

  const listTable = useDataTable({
    exportFileName: "attendance",
    columns: listColumns,
    data: listTableData,
    enableSorting: true,
    enableGlobalFilter: true,
    pageSize: 15,
    getRowId: (a) => a.id,
  });

  const sheetColumns = useAttendanceColumns({
    rowFor: sheetRowFor,
    onPatch: patchSheetRow,
    rows: sheetRows,
  });

  const sheetTableData = useMemo(() => employees ?? [], [employees]);

  const sheetTable = useDataTable({
    exportFileName: "attendance-sheet",
    columns: sheetColumns,
    data: sheetTableData,
    enableSorting: true,
    enableGlobalFilter: true,
    pageSize: 20,
    getRowId: (e) => e.id,
  });

  return (
    <div className="space-y-6 p-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-app-label-primary flex items-center gap-2">
            <CalendarCheck2 className="w-7 h-7 text-app-accent" />
            الحضور والانصراف (Attendance)
          </h1>
          <p className="text-xs text-app-label-secondary mt-1">
            سجل وتوثيق الحضور اليومي للموظفين، وتدقيق الساعات المحتسبة لجدول الرواتب.
          </p>
        </div>

        {/* Tab switcher and primary action */}
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-xl border border-app-separator bg-app-bg-secondary p-1">
            <button
              onClick={() => setActiveTab("list")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                activeTab === "list"
                  ? "bg-app-bg-primary text-app-accent shadow-sm"
                  : "text-app-label-secondary hover:text-app-label-primary"
              }`}
            >
              <List className="w-4 h-4" />
              سجل وقائمة الحضور
            </button>
            <button
              onClick={() => setActiveTab("sheet")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                activeTab === "sheet"
                  ? "bg-app-bg-primary text-app-accent shadow-sm"
                  : "text-app-label-secondary hover:text-app-label-primary"
              }`}
            >
              <CalendarCheck2 className="w-4 h-4" />
              كشف التحضير اليومي
            </button>
          </div>

          {activeTab === "list" && (
            <button
              onClick={() => {
                setError(null);
                setAddDialogOpen(true);
              }}
              className="flex items-center gap-1.5 rounded-xl bg-app-accent px-3 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90 transition-opacity"
            >
              <Plus className="w-4 h-4" />
              تسجيل حضور فردي
            </button>
          )}
        </div>
      </div>

      {/* Global Error Banner */}
      {error && !addDialogOpen && !editDialogOpen && !deleteDialogOpen && (
        <div className="flex items-start gap-2 rounded-2xl border border-app-status-danger/30 bg-app-status-danger/10 p-4 text-xs text-app-status-danger">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* TAB 1: ATTENDANCE LIST VIEW */}
      {activeTab === "list" && (
        <div className="space-y-4">
          {/* Summary Metric Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="rounded-2xl border border-app-separator bg-app-bg-primary p-3.5 shadow-sm">
              <span className="text-[11px] font-semibold text-app-label-secondary block mb-1">
                إجمالي السجلات
              </span>
              <span className="text-xl font-bold font-mono text-app-label-primary">
                {metrics.totalRecords}
              </span>
            </div>

            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-3.5 shadow-sm">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                  حاضر
                </span>
                <UserCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <span className="text-xl font-bold font-mono text-emerald-700 dark:text-emerald-400">
                {metrics.presentCount}
              </span>
            </div>

            <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-3.5 shadow-sm">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-semibold text-rose-700 dark:text-rose-400">
                  غائب
                </span>
                <UserX className="w-4 h-4 text-rose-600 dark:text-rose-400" />
              </div>
              <span className="text-xl font-bold font-mono text-rose-700 dark:text-rose-400">
                {metrics.absentCount}
              </span>
            </div>

            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-3.5 shadow-sm">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                  نصف يوم / إجازة
                </span>
                <Calendar className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              </div>
              <span className="text-xl font-bold font-mono text-amber-700 dark:text-amber-400">
                {metrics.otherCount}
              </span>
            </div>

            <div className="rounded-2xl border border-app-separator bg-app-bg-primary p-3.5 shadow-sm">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-semibold text-app-label-secondary">
                  إجمالي الساعات
                </span>
                <Clock className="w-4 h-4 text-app-accent" />
              </div>
              <span className="text-xl font-bold font-mono text-app-accent">
                {metrics.totalHours} <span className="text-xs font-normal">ساعة</span>
              </span>
              {metrics.totalOvertime > 0 && (
                <span className="block text-[11px] font-mono text-app-label-secondary mt-0.5">
                  + {metrics.totalOvertime} <span className="font-sans">ساعة إضافية</span>
                </span>
              )}
            </div>
          </div>

          {/* Filtering & Toolbar */}
          <div className="rounded-2xl border border-app-separator bg-app-bg-primary p-4 shadow-sm space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Date Presets */}
              <div className="flex items-center gap-1 bg-app-bg-secondary p-1 rounded-xl border border-app-separator text-xs">
                <button
                  onClick={() => handleDatePreset("today")}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-colors ${
                    datePreset === "today"
                      ? "bg-app-bg-primary text-app-accent shadow-sm"
                      : "text-app-label-secondary hover:text-app-label-primary"
                  }`}
                >
                  اليوم
                </button>
                <button
                  onClick={() => handleDatePreset("week")}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-colors ${
                    datePreset === "week"
                      ? "bg-app-bg-primary text-app-accent shadow-sm"
                      : "text-app-label-secondary hover:text-app-label-primary"
                  }`}
                >
                  آخر 7 أيام
                </button>
                <button
                  onClick={() => handleDatePreset("month")}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-colors ${
                    datePreset === "month"
                      ? "bg-app-bg-primary text-app-accent shadow-sm"
                      : "text-app-label-secondary hover:text-app-label-primary"
                  }`}
                >
                  هذا الشهر
                </button>
                <button
                  onClick={() => handleDatePreset("all")}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-colors ${
                    datePreset === "all"
                      ? "bg-app-bg-primary text-app-accent shadow-sm"
                      : "text-app-label-secondary hover:text-app-label-primary"
                  }`}
                >
                  جميع التواريخ
                </button>
              </div>

              {/* Refresh button */}
              <button
                onClick={() => refetchList()}
                disabled={listLoading}
                className="flex items-center gap-1 text-xs text-app-label-secondary hover:text-app-label-primary p-1.5 rounded-lg border border-app-separator hover:bg-app-bg-secondary transition-colors"
                title="تحديث البيانات"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${listLoading ? "animate-spin" : ""}`} />
                تحديث
              </button>
            </div>

            {/* Granular Filters */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2 border-t border-app-separator">
              <div>
                <label className="block text-[11px] font-semibold text-app-label-secondary mb-1">
                  من تاريخ
                </label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => {
                    setFromDate(e.target.value);
                    setDatePreset("custom");
                  }}
                  className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-1.5 text-xs font-mono text-app-label-primary focus:border-app-accent focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-app-label-secondary mb-1">
                  إلى تاريخ
                </label>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => {
                    setToDate(e.target.value);
                    setDatePreset("custom");
                  }}
                  className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-1.5 text-xs font-mono text-app-label-primary focus:border-app-accent focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-app-label-secondary mb-1">
                  الحالة
                </label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-1.5 text-xs text-app-label-primary focus:border-app-accent focus:outline-none"
                >
                  <option value="">جميع الحالات</option>
                  {(Object.keys(ATTENDANCE_STATUS_LABEL) as AttendanceStatus[]).map((s) => (
                    <option key={s} value={s}>
                      {ATTENDANCE_STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-app-label-secondary mb-1">
                  الموظف
                </label>
                <select
                  value={employeeFilter}
                  onChange={(e) => setEmployeeFilter(e.target.value)}
                  className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-1.5 text-xs text-app-label-primary focus:border-app-accent focus:outline-none"
                >
                  <option value="">جميع الموظفين</option>
                  {employees?.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.entity?.name ?? emp.job_title}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* DataTable of Attendance Records */}
          <DataTable table={listTable}>
            <DataTable.Header>
              <DataTable.Toolbar>
                <DataTable.SearchInput placeholder="بحث باسم الموظف، الوظيفة، أو الملاحظات..." />
              </DataTable.Toolbar>
            </DataTable.Header>
            <DataTable.Content
              isLoading={listLoading}
              emptyMessage="لا توجد سجلات حضور مسجلة تطابق هذه الفلاتر."
              emptyIcon={CalendarCheck2}
            />
            <DataTable.Pagination />
          </DataTable>
        </div>
      )}

      {/* TAB 2: DAILY ROSTER SHEET VIEW */}
      {activeTab === "sheet" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-app-separator bg-app-bg-primary p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-bold text-app-label-primary">
                كشف التحضير السريع لكافة الموظفين
              </h2>
              <p className="text-xs text-app-label-secondary mt-0.5">
                اختر التاريخ، ثم حدد حالة الحضور وساعات العمل والساعات الإضافية لكل موظف، ثم احفظ الكشف.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div>
                <label className="block text-[10px] font-semibold text-app-label-secondary mb-0.5">
                  تاريخ الكشف
                </label>
                <input
                  type="date"
                  value={sheetWorkDate}
                  max={todayIso()}
                  onChange={(e) => {
                    setSheetWorkDate(e.target.value);
                    setSheetRows({});
                  }}
                  className="rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs font-mono text-app-label-primary focus:border-app-accent focus:outline-none"
                />
              </div>

              <button
                type="button"
                onClick={markAllPresent}
                disabled={!sheetReady}
                className="mt-4 flex items-center gap-1.5 rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs font-semibold text-app-label-primary hover:bg-app-fill-f1 disabled:opacity-50 transition-colors"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                تحضير الكل كحاضر (8س)
              </button>

              <button
                type="button"
                onClick={handleSaveSheet}
                disabled={saveSheetMutation.isPending || !employees?.length || !sheetReady}
                className="mt-4 flex items-center gap-1.5 rounded-xl bg-app-accent px-4 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                <Save className="w-4 h-4" />
                {saveSheetMutation.isPending ? "جارٍ الحفظ…" : "حفظ الكشف اليومي"}
              </button>
            </div>
          </div>

          {sheetSaved && (
            <div className="flex items-center gap-2 rounded-2xl border border-app-status-positive/30 bg-app-status-positive/10 p-4 text-xs font-bold text-app-status-positive">
              <CheckCircle2 className="w-4 h-4" />
              حُفظ كشف الحضور لتاريخ {sheetWorkDate} بنجاح. تم تحديث سجلات الحضور.
            </div>
          )}

          <DataTable table={sheetTable}>
            <DataTable.Header>
              <DataTable.Toolbar>
                <DataTable.SearchInput placeholder="بحث عن موظف في الكشف..." />
              </DataTable.Toolbar>
            </DataTable.Header>
            <DataTable.Content
              isLoading={dailyLoading || employeesLoading}
              emptyMessage="لا يوجد موظفون مسجلون بالمنشأة."
              emptyIcon={CalendarCheck2}
            />
            <DataTable.Pagination />
          </DataTable>
        </div>
      )}

      {/* MODAL: ADD SINGLE ATTENDANCE RECORD */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>تسجيل حضور جديد لموظف</DialogTitle>
          </DialogHeader>
          <DialogBody>
            {error && (
              <div className="mb-3 flex items-start gap-2 rounded-xl border border-app-status-danger/30 bg-app-status-danger/10 p-3 text-xs text-app-status-danger">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                  الموظف <span className="text-app-status-danger">*</span>
                </label>
                <SearchableSelect<Employee>
                  options={employees ?? []}
                  value={employees?.find((e) => e.id === addEmployeeId) ?? null}
                  onChange={(emp) => setAddEmployeeId(emp ? emp.id : "")}
                  getOptionId={(e) => e.id}
                  getOptionLabel={(e) => e.entity?.name ?? e.job_title}
                  getOptionSubLabel={(e) => e.job_title}
                  getOptionSearchText={(e) => `${e.entity?.name ?? ""} ${e.job_title}`}
                  placeholder="اختر الموظف..."
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                    التاريخ <span className="text-app-status-danger">*</span>
                  </label>
                  <input
                    type="date"
                    value={addWorkDate}
                    max={todayIso()}
                    onChange={(e) => setAddWorkDate(e.target.value)}
                    className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs font-mono text-app-label-primary focus:border-app-accent focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                    الحالة <span className="text-app-status-danger">*</span>
                  </label>
                  <select
                    value={addStatus}
                    onChange={(e) => {
                      const next = e.target.value as AttendanceStatus;
                      setAddStatus(next);
                      if (next === "present") setAddHours("8");
                      else if (next === "half_day") setAddHours("4");
                      else {
                        setAddHours("0");
                        setAddOvertime("0");
                      }
                    }}
                    className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs text-app-label-primary focus:border-app-accent focus:outline-none"
                  >
                    {(Object.keys(ATTENDANCE_STATUS_LABEL) as AttendanceStatus[]).map((s) => (
                      <option key={s} value={s}>
                        {ATTENDANCE_STATUS_LABEL[s]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                    ساعات العمل
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max="24"
                    disabled={addStatus === "absent" || addStatus === "leave"}
                    value={addHours}
                    onChange={(e) => setAddHours(e.target.value)}
                    className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs font-mono text-app-label-primary focus:border-app-accent focus:outline-none disabled:opacity-40"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                    ساعات إضافية
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max="24"
                    disabled={!isPayableAttendance(addStatus)}
                    value={addOvertime}
                    onChange={(e) => setAddOvertime(e.target.value)}
                    className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs font-mono text-app-label-primary focus:border-app-accent focus:outline-none disabled:opacity-40"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                  ملاحظات
                </label>
                <textarea
                  rows={2}
                  value={addNotes}
                  onChange={(e) => setAddNotes(e.target.value)}
                  placeholder="ملاحظات اختيارية..."
                  className="w-full rounded-xl border border-app-separator bg-app-bg-secondary p-2 text-xs text-app-label-primary focus:border-app-accent focus:outline-none"
                />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <button
              onClick={() => setAddDialogOpen(false)}
              className="px-3 py-2 text-xs font-semibold rounded-xl border border-app-separator hover:bg-app-bg-secondary"
            >
              إلغاء
            </button>
            <button
              onClick={handleSaveAdd}
              disabled={createMutation.isPending || !addEmployeeId}
              className="px-4 py-2 text-xs font-bold rounded-xl bg-app-accent text-white hover:opacity-90 disabled:opacity-50"
            >
              {createMutation.isPending ? "جارٍ الحفظ…" : "حفظ السجل"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: EDIT ATTENDANCE RECORD */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>تعديل سجل الحضور</DialogTitle>
          </DialogHeader>
          <DialogBody>
            {error && (
              <div className="mb-3 flex items-start gap-2 rounded-xl border border-app-status-danger/30 bg-app-status-danger/10 p-3 text-xs text-app-status-danger">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
            {selectedRecord && (
              <div className="space-y-3">
                <div className="rounded-xl bg-app-bg-secondary p-3 border border-app-separator text-xs space-y-1">
                  <div>
                    <span className="text-app-label-secondary">الموظف: </span>
                    <span className="font-bold text-app-label-primary">
                      {selectedRecord.employee?.entity?.name ?? selectedRecord.employee?.job_title}
                    </span>
                  </div>
                  <div>
                    <span className="text-app-label-secondary">التاريخ: </span>
                    <span className="font-mono text-app-label-primary">
                      {selectedRecord.work_date?.slice(0, 10)}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                      الحالة <span className="text-app-status-danger">*</span>
                    </label>
                    <select
                      value={editStatus}
                      onChange={(e) => {
                        const next = e.target.value as AttendanceStatus;
                        setEditStatus(next);
                        if (next === "present" && Number(editHours) <= 0) setEditHours("8");
                        else if (next === "half_day" && Number(editHours) <= 0) setEditHours("4");
                        else if (next === "absent" || next === "leave") {
                          setEditHours("0");
                          setEditOvertime("0");
                        }
                      }}
                      className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs text-app-label-primary focus:border-app-accent focus:outline-none"
                    >
                      {(Object.keys(ATTENDANCE_STATUS_LABEL) as AttendanceStatus[]).map((s) => (
                        <option key={s} value={s}>
                          {ATTENDANCE_STATUS_LABEL[s]}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                      ساعات العمل
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      max="24"
                      disabled={editStatus === "absent" || editStatus === "leave"}
                      value={editHours}
                      onChange={(e) => setEditHours(e.target.value)}
                      className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs font-mono text-app-label-primary focus:border-app-accent focus:outline-none disabled:opacity-40"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                      ساعات إضافية
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      max="24"
                      disabled={!isPayableAttendance(editStatus)}
                      value={editOvertime}
                      onChange={(e) => setEditOvertime(e.target.value)}
                      className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs font-mono text-app-label-primary focus:border-app-accent focus:outline-none disabled:opacity-40"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                    ملاحظات
                  </label>
                  <textarea
                    rows={2}
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    placeholder="ملاحظات اختيارية..."
                    className="w-full rounded-xl border border-app-separator bg-app-bg-secondary p-2 text-xs text-app-label-primary focus:border-app-accent focus:outline-none"
                  />
                </div>
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <button
              onClick={() => setEditDialogOpen(false)}
              className="px-3 py-2 text-xs font-semibold rounded-xl border border-app-separator hover:bg-app-bg-secondary"
            >
              إلغاء
            </button>
            <button
              onClick={handleSaveEdit}
              disabled={updateMutation.isPending}
              className="px-4 py-2 text-xs font-bold rounded-xl bg-app-accent text-white hover:opacity-90 disabled:opacity-50"
            >
              {updateMutation.isPending ? "جارٍ الحفظ…" : "حفظ التعديلات"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: DELETE CONFIRMATION */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>تأكيد حذف سجل الحضور</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <p className="text-xs text-app-label-secondary leading-relaxed">
              هل أنت متأكد من رغبتك في حذف هذا السجل للموظف{" "}
              <strong className="text-app-label-primary">
                {selectedRecord?.employee?.entity?.name ?? selectedRecord?.employee?.job_title}
              </strong>{" "}
              لتاريخ{" "}
              <span className="font-mono text-app-label-primary">
                {selectedRecord?.work_date?.slice(0, 10)}
              </span>
              ؟ لن يتم احتساب هذا اليوم في حساب الرواتب.
            </p>
          </DialogBody>
          <DialogFooter>
            <button
              onClick={() => setDeleteDialogOpen(false)}
              className="px-3 py-2 text-xs font-semibold rounded-xl border border-app-separator hover:bg-app-bg-secondary"
            >
              إلغاء
            </button>
            <button
              onClick={handleConfirmDelete}
              disabled={deleteMutation.isPending}
              className="px-4 py-2 text-xs font-bold rounded-xl bg-app-status-danger text-white hover:opacity-90 disabled:opacity-50"
            >
              {deleteMutation.isPending ? "جارٍ الحذف…" : "تأكيد الحذف"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
