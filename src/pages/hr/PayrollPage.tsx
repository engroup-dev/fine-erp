import React, { useCallback, useMemo, useState } from "react";
import {
  Banknote,
  Plus,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Calendar,
  BarChart3,
  TrendingUp,
  Users,
  ArrowUpRight,
  Layers,
  Filter,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  Cell,
} from "recharts";
import {
  usePayrollRuns,
  usePayslips,
  useOpenPayrollRun,
  usePayrollAction,
} from "../../hooks/useHr";
import { apiErrorMessage, apiErrorPayload } from "../../api/endpoints/production";
import { TreasurySelect } from "../../components/treasury/TreasurySelect";
import {
  PAYROLL_STATUS_LABEL,
  isAdvanceDeduction,
  isLockedDeduction,
  type PayrollRun,
  type Payslip,
} from "../../api/endpoints/hr";
import { formatNumber } from "../../lib/utils/format";
import { useEmployeesForParty } from "../../hooks/useEmployees";
import { useIsCompanyWide } from "../../hooks/useAccounting";
import { useOperatingUnits } from "../../hooks/usePartners";
import { DataTable, useDataTable } from "../../components/ui/DataTable";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { usePayslipsColumns } from "../../components/table-columns/payslipsColumns";

const STATUS_STYLE: Record<PayrollRun["status"], string> = {
  draft: "bg-app-fill-f1 text-app-label-secondary border-app-separator",
  calculated: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
  pending_approval: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
  approved: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30",
  paid: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  posted: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40",
};

const NEXT_ACTION: Partial<
  Record<
    PayrollRun["status"],
    { action: "calculate" | "submit" | "approve" | "mark-paid" | "post"; label: string; desc: string }
  >
> = {
  draft: { action: "calculate", label: "احتساب المسير", desc: "تجميع ساعات الحضور وسجلات الإنتاج واحتساب الصافي" },
  calculated: { action: "submit", label: "إرسال للاعتماد المحاسبي", desc: "قفل التعديلات ورفع المسير للمراجعة المحاسبية" },
  pending_approval: { action: "approve", label: "اعتماد المسير", desc: "الموافقة الرسمية من قبل الإدارة المالية" },
  approved: { action: "mark-paid", label: "تأكيد الصرف", desc: "صرف الرواتب للموظفين وإثبات السداد" },
  paid: { action: "post", label: "ترحيل للدفاتر", desc: "ترحيل قيود الرواتب والالتزامات للدفاتر المحاسبية" },
};

/** HR-11: a pay change reached this calculated run after it was calculated, so the backend refuses submit. */
const RECALCULATE_ACTION = {
  action: "calculate" as const,
  label: "إعادة احتساب المسير",
  desc: "تغيّرت أجور بعض الموظفين أو بدلاتهم واستقطاعاتهم الثابتة، أو اعتُمدت مكافأة أو جزاء أو حُذف، أو صُرفت سلفة أو سُدِّدت نقداً بعد احتساب هذا المسير؛ أعد احتسابه قبل إرساله للاعتماد.",
};

function nextActionFor(run: PayrollRun) {
  if (run.status === "calculated" && run.needs_recalculation) return RECALCULATE_ACTION;
  return NEXT_ACTION[run.status];
}

function getPreviousMonth(p: string): string {
  const [year, month] = p.split("-").map(Number);
  const date = new Date(year, month - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getNextMonth(p: string): string {
  const [year, month] = p.split("-").map(Number);
  const date = new Date(year, month, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

const PayslipsTable: React.FC<{
  payslips: Payslip[];
  run: PayrollRun;
  onError: (m: string) => void;
}> = ({ payslips, run, onError }) => {
  const [unitFilter, setUnitFilter] = useState<string>("all");
  const columns = usePayslipsColumns({ run, onError });

  const units = useMemo(() => {
    const set = new Set<string>();
    payslips.forEach((p) => {
      if (p.operating_unit?.name) set.add(p.operating_unit.name);
    });
    return Array.from(set);
  }, [payslips]);

  const filteredData = useMemo(() => {
    if (unitFilter === "all") return payslips;
    return payslips.filter((p) => p.operating_unit?.name === unitFilter);
  }, [payslips, unitFilter]);

  const table = useDataTable({
    exportFileName: "payslips",
    columns,
    data: filteredData,
    enableSorting: true,
    enableGlobalFilter: true,
    enablePagination: true,
    pageSize: 20,
    getRowId: (p) => p.id,
  });

  return (
    <DataTable table={table}>
      <DataTable.Header>
        <DataTable.Toolbar>
          <DataTable.SearchInput placeholder="بحث باسم الموظف أو الرقم..." />
          {units.length > 1 && (
            <div className="flex items-center gap-1.5 text-xs text-app-label-secondary">
              <Filter className="w-3.5 h-3.5 text-app-label-tertiary" />
              <select
                value={unitFilter}
                onChange={(e) => setUnitFilter(e.target.value)}
                className="rounded-xl border border-app-separator bg-app-bg-primary px-2.5 py-1.5 text-xs text-app-label-primary focus:border-app-accent focus:outline-none"
              >
                <option value="all">جميع الوحدات ({payslips.length})</option>
                {units.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
          )}
        </DataTable.Toolbar>
        <DataTable.Actions>
          <span className="text-xs font-mono text-app-label-secondary">
            عدد القسائم: {filteredData.length}
          </span>
        </DataTable.Actions>
      </DataTable.Header>
      <DataTable.Content emptyMessage="لا توجد قسائم رواتب مطابقة." emptyIcon={Banknote} />
      <DataTable.Pagination />
    </DataTable>
  );
};

/** An employee a calculation refusal names (HR-13), with the figures it gave when it gave them. */
interface RefusedEmployee {
  employee_id: string;
  gross_pay?: number;
  deductions?: number;
}

interface PayrollError {
  text: string;
  employees: RefusedEmployee[];
  /** PAYROLL_ADJUSTMENT_UNPAID names only the first employee; this counts every unpaid adjustment. */
  unpaidAdjustments?: number;
}

const REFUSED_NAMES_SHOWN = 10;

/** The payroll charts' SVG is LTR; their HTML tooltips stay RTL so Arabic labels read correctly. */
const RTL_CHART_HTML: React.CSSProperties = { direction: "rtl", textAlign: "right" };

/** The unit chart's category label: names past 14 characters are cut with an ellipsis. */
const UNIT_LABEL_MAX = 14;
const shortUnitLabel = (name: string): string =>
  typeof name === "string" && name.length > UNIT_LABEL_MAX ? `${name.slice(0, UNIT_LABEL_MAX - 1)}…` : name;

export const PayrollPage: React.FC = () => {
  const [errorState, setErrorState] = useState<PayrollError | null>(null);
  // Stable, as the useState setter it replaces was: the payslip columns memoize on it.
  const setError = useCallback(
    (text: string | null) => setErrorState(text ? { text, employees: [] } : null),
    [],
  );
  const currentMonthStr = useMemo(() => new Date().toISOString().slice(0, 7), []);
  const [selectedPeriod, setSelectedPeriod] = useState<string>(currentMonthStr);
  const [viewMode, setViewMode] = useState<"month" | "all">("month");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [postingRun, setPostingRun] = useState<PayrollRun | null>(null);
  const [postTreasuryId, setPostTreasuryId] = useState("");
  const [recalcRun, setRecalcRun] = useState<PayrollRun | null>(null);
  const [createPeriod, setCreatePeriod] = useState<string>(currentMonthStr);

  const { data: allRunsData, isLoading: isAllRunsLoading } = usePayrollRuns({ per_page: 50 });
  const openMutation = useOpenPayrollRun();
  const actionMutation = usePayrollAction();

  const allRuns = useMemo(() => allRunsData?.data ?? [], [allRunsData]);

  // Find active run for the selected period
  const activeRun = useMemo(() => {
    return allRuns.find((r) => r.period === selectedPeriod) ?? null;
  }, [allRuns, selectedPeriod]);

  // Fetch payslips for the active run
  const { data: payslips, isLoading: isPayslipsLoading } = usePayslips(activeRun?.id);

  // HR-13: name the employees a calculation refusal lists. The run rolls back, so no payslip
  // shows them; fetch the employee lists only once a refusal names someone.
  const companyWide = useIsCompanyWide();
  const { data: units = [] } = useOperatingUnits();
  const namesNeeded = (errorState?.employees.length ?? 0) > 0;
  const unitIds = useMemo(() => (namesNeeded ? units.map((u) => u.id) : []), [namesNeeded, units]);
  const { data: partyEmployees } = useEmployeesForParty(companyWide, unitIds);
  const error = ((): string | null => {
    if (!errorState) return null;
    if (errorState.employees.length === 0) return errorState.text;
    const nameById = new Map(partyEmployees.map((e) => [e.id, e.entity?.name ?? e.employee_number ?? null]));
    const money = (n: number) => formatNumber(Number(n), { maximumFractionDigits: 2 });
    const nameOf = (id: string) => nameById.get(id) ?? `موظف (${id.slice(0, 8)})`;
    // PAYROLL_ADJUSTMENT_UNPAID names only the first employee; the count covers every employee.
    if (errorState.unpaidAdjustments !== undefined) {
      const count = errorState.unpaidAdjustments > 0
        ? ` عدد المكافآت والجزاءات المعتمدة غير المصروفة: ${errorState.unpaidAdjustments}.`
        : "";
      return `${errorState.text} أول موظف معني: ${nameOf(errorState.employees[0].employee_id)}.${count}`;
    }
    const parts = errorState.employees.slice(0, REFUSED_NAMES_SHOWN).map((e) => {
      const name = nameOf(e.employee_id);
      if (e.deductions != null && e.gross_pay != null) {
        return `${name} (استقطاعات ${money(e.deductions)} مقابل إجمالي ${money(e.gross_pay)})`;
      }
      return name;
    });
    const more = errorState.employees.length - REFUSED_NAMES_SHOWN;
    const list = parts.join("، ") + (more > 0 ? `، و${more} آخرون` : "");
    return `${errorState.text} الموظفون: ${list}.`;
  })();

  const fail = (err: unknown, fallback: string) => {
    const payload = apiErrorPayload(err);
    // HR-11: a pay change flagged the run after this page loaded it; the refusal is English.
    // usePayrollMutation refetches the runs on error, so the recalculate action appears.
    if (payload?.code === "INVALID_PAYROLL_TRANSITION" && /recalculate it before submitting/.test(payload.message ?? "")) {
      setError(RECALCULATE_ACTION.desc);
      return;
    }
    // HR-13: name each employee whose standing and one-off deductions exceed their gross.
    if (payload?.code === "PAYROLL_DEDUCTIONS_EXCEED_GROSS" && payload.employees?.length) {
      setErrorState({ text: apiErrorMessage(err, fallback), employees: payload.employees });
      return;
    }
    // HR-13: the refusal names the first employee left with unpaid approved adjustments.
    if (payload?.code === "PAYROLL_ADJUSTMENT_UNPAID" && payload.employee_id) {
      setErrorState({
        text: apiErrorMessage(err, fallback),
        employees: [{ employee_id: payload.employee_id }],
        unpaidAdjustments: payload.adjustment_ids?.length ?? 0,
      });
      return;
    }
    setError(apiErrorMessage(err, fallback));
  };

  const openRun = (targetPeriod: string) => {
    setError(null);
    openMutation.mutate(targetPeriod, {
      onSuccess: () => {
        setSelectedPeriod(targetPeriod);
        setViewMode("month");
        setIsCreateOpen(false);
      },
      onError: (err) => fail(err, "تعذر فتح المسير."),
    });
  };

  const act = (run: PayrollRun) => {
    const next = nextActionFor(run);
    if (!next) return;
    setError(null);
    // Posting writes the journal, so it asks which treasury the net pay left from.
    if (next.action === "post") {
      setPostingRun(run);
      return;
    }
    // Recalculating rebuilds every payslip, which drops hand-entered deductions: confirm first.
    if (next === RECALCULATE_ACTION) {
      setRecalcRun(run);
      return;
    }
    actionMutation.mutate(
      { id: run.id, action: next.action },
      { onError: (err) => fail(err, "تعذر تنفيذ الإجراء.") },
    );
  };

  const recalculateRun = () => {
    if (!recalcRun) return;
    const run = recalcRun;
    actionMutation.mutate(
      { id: run.id, action: "calculate" },
      {
        onSuccess: () => setRecalcRun(null),
        onError: (err) => {
          setRecalcRun(null);
          fail(err, "تعذر إعادة احتساب المسير.");
        },
      },
    );
  };

  // Payslips of the run being recalculated that carry hand-entered deductions (only known
  // for the loaded run). The locked lines (HR-12 advances, HR-13 standing and one-off
  // deductions) are rebuilt from their sources.
  const manualDeductionCount = useMemo(() => {
    if (!recalcRun || recalcRun.id !== activeRun?.id) return null;
    return (payslips ?? []).filter((p) => (p.deductions ?? []).some((d) => !isLockedDeduction(d))).length;
  }, [recalcRun, activeRun, payslips]);

  const recalcMessage = recalcRun
    ? [
        `إعادة احتساب مسير ${recalcRun.period} تحذف جميع القسائم الحالية وتبنيها من جديد على الأجور المحدّثة.`,
        "تُحذف معها جميع الاستقطاعات المُدخلة يدوياً على القسائم؛ أعد إدخالها بعد الاحتساب. أما البدلات والاستقطاعات الثابتة والمكافآت والجزاءات المعتمدة فتُعاد من مصادرها، واسترداد السلف يُعاد احتسابه آلياً من جداول أقساطها.",
        manualDeductionCount
          ? `عدد القسائم التي عليها استقطاعات: ${manualDeductionCount}.`
          : "",
      ]
        .filter(Boolean)
        .join(" ")
    : "";

  const postRun = () => {
    if (!postingRun || !postTreasuryId) return;
    setError(null);
    actionMutation.mutate(
      { id: postingRun.id, action: "post", cashAccountId: postTreasuryId },
      {
        onSuccess: () => {
          setPostingRun(null);
          setPostTreasuryId("");
        },
        onError: (err) => {
          setPostingRun(null);
          fail(err, "تعذر ترحيل المسير.");
        },
      },
    );
  };

  // Detailed month statistics
  const monthStats = useMemo(() => {
    if (!activeRun) return null;

    const list = payslips ?? [];
    const baseTotal = list.reduce((sum, p) => sum + Number(p.base_pay || 0), 0);
    const attendanceTotal = list.reduce((sum, p) => sum + Number(p.attendance_pay || 0), 0);
    const overtimeTotal = list.reduce((sum, p) => sum + Number(p.overtime_pay || 0), 0);
    const laborLogTotal = list.reduce((sum, p) => sum + Number(p.labor_log_pay || 0), 0);
    const additionsTotal = list.reduce((sum, p) => sum + Number(p.additions_pay || 0), 0);
    const grossTotal = Number(activeRun.total_gross || 0);
    const netTotal = Number(activeRun.total_net || 0);
    const deductionsTotal = Number(activeRun.total_deductions || 0);
    const employeeCount = list.length > 0 ? list.length : (activeRun.payslips_count ?? 0);

    // Breakdown data for salary components chart
    const compositionData = [
      { name: "الأساسي", amount: baseTotal, fill: "#3b82f6" },
      { name: "الحضور", amount: attendanceTotal, fill: "#f59e0b" },
      { name: "الإضافي", amount: overtimeTotal, fill: "#f97316" },
      { name: "الإنتاج", amount: laborLogTotal, fill: "#8b5cf6" },
      { name: "البدلات والمكافآت", amount: additionsTotal, fill: "#10b981" },
      { name: "الاستقطاعات", amount: deductionsTotal, fill: "#ef4444" },
    ];

    // Breakdown data by operating unit
    const unitMap: Record<string, { unit: string; gross: number; net: number; count: number }> = {};
    list.forEach((p) => {
      const uName = p.operating_unit?.name || "الوحدة الرئيسية";
      if (!unitMap[uName]) {
        unitMap[uName] = { unit: uName, gross: 0, net: 0, count: 0 };
      }
      unitMap[uName].gross += Number(p.gross_pay || 0);
      unitMap[uName].net += Number(p.net_pay || 0);
      unitMap[uName].count += 1;
    });
    const unitData = Object.values(unitMap);

    // Deductions breakdown
    const deductionsMap: Record<string, { type: string; amount: number; count: number }> = {};
    list.forEach((p) => {
      const seen = new Set<string>();
      (p.deductions ?? []).forEach((d) => {
        // HR-12: every installment line of every advance shows as one advance-recovery tag,
        // counted once per employee.
        const type = isAdvanceDeduction(d) ? "استرداد السلف" : d.type;
        if (!deductionsMap[type]) {
          deductionsMap[type] = { type, amount: 0, count: 0 };
        }
        deductionsMap[type].amount += Number(d.amount || 0);
        if (!seen.has(type)) {
          seen.add(type);
          deductionsMap[type].count += 1;
        }
      });
    });
    const deductionsData = Object.values(deductionsMap);

    return {
      baseTotal,
      attendanceTotal,
      laborLogTotal,
      grossTotal,
      netTotal,
      deductionsTotal,
      employeeCount,
      compositionData,
      unitData,
      deductionsData,
    };
  }, [activeRun, payslips]);

  // Trend data across all runs for the overview mode
  const trendData = useMemo(() => {
    return [...allRuns]
      .sort((a, b) => a.period.localeCompare(b.period))
      .map((r) => ({
        period: r.period,
        gross: Number(r.total_gross || 0),
        net: Number(r.total_net || 0),
        deductions: Number(r.total_deductions || 0),
        count: r.payslips_count ?? 0,
      }));
  }, [allRuns]);

  return (
    <div className="space-y-6 p-6" dir="rtl">
      {/* Top Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-app-label-primary flex items-center gap-2">
            <Banknote className="w-7 h-7 text-app-accent" />
            مسير الرواتب والأجور (Payroll)
          </h1>
          <p className="text-xs text-app-label-secondary mt-1">
            دورة الصرف المعتمدة: احتساب الرواتب والبدلات ← مراجعة الاستقطاعات ← اعتماد الإدارة المالية ← تأكيد الصرف ← الترحيل لدفاتر الحسابات.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsCreateOpen(true)}
            className="flex items-center gap-1.5 rounded-xl bg-app-accent px-4 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" /> فتح مسير شهر جديد
          </button>
        </div>
      </div>

      {/* Filter and Mode Control Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-app-separator bg-app-bg-primary p-4 shadow-sm">
        {/* View Mode Toggle */}
        <div className="flex rounded-xl border border-app-separator overflow-hidden bg-app-bg-secondary p-0.5 self-start">
          <button
            onClick={() => setViewMode("month")}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all ${
              viewMode === "month"
                ? "bg-app-bg-primary text-app-label-primary shadow-sm"
                : "text-app-label-secondary hover:text-app-label-primary"
            }`}
          >
            <Calendar className="w-3.5 h-3.5 text-app-accent" />
            تفاصيل شهر محدد
          </button>
          <button
            onClick={() => setViewMode("all")}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all ${
              viewMode === "all"
                ? "bg-app-bg-primary text-app-label-primary shadow-sm"
                : "text-app-label-secondary hover:text-app-label-primary"
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5 text-app-accent" />
            نظرة عامة لجميع الشهور ({allRuns.length})
          </button>
        </div>

        {/* Month Selector Controls (Active in Month Mode) */}
        {viewMode === "month" && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-app-label-secondary">الشهر المفلتر:</span>
            <div className="flex items-center rounded-xl border border-app-separator bg-app-bg-secondary p-1">
              <button
                onClick={() => setSelectedPeriod((p) => getNextMonth(p))}
                className="rounded-lg p-1 text-app-label-secondary hover:bg-app-fill-f1 hover:text-app-label-primary"
                title="الشهر التالي"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <input
                type="month"
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                className="bg-transparent px-2.5 py-0.5 text-xs font-mono font-bold text-app-label-primary focus:outline-none"
              />
              <button
                onClick={() => setSelectedPeriod((p) => getPreviousMonth(p))}
                className="rounded-lg p-1 text-app-label-secondary hover:bg-app-fill-f1 hover:text-app-label-primary"
                title="الشهر السابق"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>

            {selectedPeriod !== currentMonthStr && (
              <button
                onClick={() => setSelectedPeriod(currentMonthStr)}
                className="rounded-xl border border-app-separator bg-app-bg-secondary px-2.5 py-1.5 text-[11px] font-semibold text-app-label-secondary hover:text-app-accent hover:bg-app-fill-f1"
              >
                الشهر الحالي
              </button>
            )}

            {allRuns.length > 0 && (
              <select
                value={allRuns.some((r) => r.period === selectedPeriod) ? selectedPeriod : ""}
                onChange={(e) => e.target.value && setSelectedPeriod(e.target.value)}
                className="rounded-xl border border-app-separator bg-app-bg-secondary px-2.5 py-1.5 text-xs font-mono text-app-label-primary focus:border-app-accent focus:outline-none"
              >
                <option value="" disabled>
                  اختر من المسيرات المسجلة...
                </option>
                {allRuns.map((r) => (
                  <option key={r.id} value={r.period}>
                    {r.period} ({PAYROLL_STATUS_LABEL[r.status]})
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-2xl border border-app-status-danger/30 bg-app-status-danger/10 p-4 text-xs text-app-status-danger">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* VIEW MODE: DETAILED MONTH VIEW */}
      {viewMode === "month" && (
        <div className="space-y-6">
          {isAllRunsLoading ? (
            <div className="flex h-64 items-center justify-center rounded-2xl border border-app-separator bg-app-bg-primary text-xs text-app-label-secondary">
              جارٍ تحميل بيانات المسير…
            </div>
          ) : !activeRun ? (
            /* Empty State for Month */
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-app-separator bg-app-bg-primary p-12 text-center shadow-sm">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-app-accent/10 text-app-accent mb-4">
                <Calendar className="h-7 w-7" />
              </div>
              <h2 className="text-base font-bold text-app-label-primary">
                لا يوجد مسير رواتب مسجل لشهر ({selectedPeriod})
              </h2>
              <p className="text-xs text-app-label-secondary mt-1.5 max-w-md">
                يمكنك فتح مسير رواتب جديد لهذا الشهر للبدء في تجميع بيانات الحضور وسجلات العمل واحتساب المستحقات آلياً.
              </p>
              <button
                onClick={() => openRun(selectedPeriod)}
                disabled={openMutation.isPending}
                className="mt-5 flex items-center gap-2 rounded-xl bg-app-accent px-4 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                <Plus className="w-4 h-4" /> فتح مسير شهر {selectedPeriod} الآن
              </button>
            </div>
          ) : (
            /* Month Details and Visualization */
            <div className="space-y-6">
              {/* Month Status & Workflow Action Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-app-separator bg-app-bg-primary p-5 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-app-accent/15 text-app-accent">
                    <Calendar className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold font-mono text-app-label-primary">
                        مسير شهر {activeRun.period}
                      </span>
                      <span
                        className={`px-2.5 py-0.5 text-xs font-bold rounded-full border ${
                          STATUS_STYLE[activeRun.status]
                        }`}
                      >
                        {PAYROLL_STATUS_LABEL[activeRun.status]}
                      </span>
                      {activeRun.status === "calculated" && activeRun.needs_recalculation && (
                        <span className="px-2.5 py-0.5 text-xs font-bold rounded-full border bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30">
                          يحتاج إعادة احتساب
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-app-label-secondary mt-0.5">
                      {nextActionFor(activeRun)?.desc ?? "المسير معتمد ومرحل بالكامل إلى شجرة الحسابات."}
                    </p>
                  </div>
                </div>

                {nextActionFor(activeRun) && (
                  <button
                    onClick={() => act(activeRun)}
                    disabled={actionMutation.isPending}
                    className="flex items-center gap-1.5 rounded-xl bg-app-accent px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
                  >
                    <ArrowUpRight className="w-4 h-4" />
                    {nextActionFor(activeRun)?.label}
                  </button>
                )}
              </div>

              {activeRun.status === "calculated" && activeRun.needs_recalculation && (
                <div className="flex items-start gap-2 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-700 dark:text-rose-300">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    سُجّل تغيير أجر أو بدل أو استقطاع ثابت، أو اعتماد مكافأة أو جزاء أو حذفه، أو صرف سلفة أو سداد نقدي لقسط، أو تعديل وردية أو نقل موظف إلى وردية أخرى أو تغيير إعدادات العمل الإضافي، يمس شهر {activeRun.period} بعد احتساب هذا المسير، فالقسائم الحالية لا تعكسه.
                    لا يمكن إرساله للاعتماد حتى يُعاد احتسابه. إعادة الاحتساب تحذف الاستقطاعات المُدخلة يدوياً على القسائم،
                    فأدخلها بعد الاحتساب لا قبله.
                  </span>
                </div>
              )}

              {/* KPI Summary Cards Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {/* Gross Pay */}
                <div className="rounded-2xl border border-app-separator bg-app-bg-primary p-4 shadow-sm">
                  <span className="text-[11px] font-semibold text-app-label-secondary block">
                    إجمالي المستحق (Gross)
                  </span>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-lg font-bold font-mono text-app-label-primary">
                      {formatNumber(monthStats?.grossTotal)}
                    </span>
                    <span className="text-[10px] text-app-label-tertiary font-mono">د.ل</span>
                  </div>
                </div>

                {/* Base Pay */}
                <div className="rounded-2xl border border-app-separator bg-app-bg-primary p-4 shadow-sm">
                  <span className="text-[11px] font-semibold text-app-label-secondary block">
                    الراتب الأساسي (Base)
                  </span>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-lg font-bold font-mono text-blue-600 dark:text-blue-400">
                      {formatNumber(monthStats?.baseTotal)}
                    </span>
                    <span className="text-[10px] text-app-label-tertiary font-mono">د.ل</span>
                  </div>
                </div>

                {/* Attendance Pay */}
                <div className="rounded-2xl border border-app-separator bg-app-bg-primary p-4 shadow-sm">
                  <span className="text-[11px] font-semibold text-app-label-secondary block">
                    أجر الحضور والدوام
                  </span>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-lg font-bold font-mono text-amber-600 dark:text-amber-400">
                      {formatNumber(monthStats?.attendanceTotal)}
                    </span>
                    <span className="text-[10px] text-app-label-tertiary font-mono">د.ل</span>
                  </div>
                </div>

                {/* Production Pay */}
                <div className="rounded-2xl border border-app-separator bg-app-bg-primary p-4 shadow-sm">
                  <span className="text-[11px] font-semibold text-app-label-secondary block">
                    أجور الإنتاج والمهام
                  </span>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-lg font-bold font-mono text-purple-600 dark:text-purple-400">
                      {formatNumber(monthStats?.laborLogTotal)}
                    </span>
                    <span className="text-[10px] text-app-label-tertiary font-mono">د.ل</span>
                  </div>
                </div>

                {/* Total Deductions */}
                <div className="rounded-2xl border border-app-separator bg-app-bg-primary p-4 shadow-sm">
                  <span className="text-[11px] font-semibold text-app-label-secondary block">
                    إجمالي الاستقطاعات
                  </span>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-lg font-bold font-mono text-rose-600 dark:text-rose-400">
                      {formatNumber(monthStats?.deductionsTotal)}
                    </span>
                    <span className="text-[10px] text-app-label-tertiary font-mono">د.ل</span>
                  </div>
                </div>

                {/* Net Pay */}
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 shadow-sm">
                  <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 block">
                    صافي الصرف (Net)
                  </span>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400">
                      {formatNumber(monthStats?.netTotal)}
                    </span>
                    <span className="text-[10px] text-emerald-600/70 font-mono">د.ل</span>
                  </div>
                </div>
              </div>

              {/* Visualizations Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Visualization 1: Salary Composition Breakdown */}
                <div className="rounded-2xl border border-app-separator bg-app-bg-primary p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="w-5 h-5 text-app-accent" />
                      <h3 className="text-sm font-bold text-app-label-primary">
                        توزيع بنود الرواتب لشهر {activeRun.period}
                      </h3>
                    </div>
                    <span className="text-xs font-mono text-app-label-secondary">
                      المجموع: {formatNumber(monthStats?.grossTotal)} د.ل
                    </span>
                  </div>

                  {/*
                    The charts render left-to-right: under the page's RTL direction the SVG
                    tick text anchors flip and the axis labels land on top of the bars.
                    Only the SVG stays LTR: the empty state, tooltip and legend are HTML
                    and are set back to RTL so the Arabic reads correctly.
                  */}
                  <div className="h-64 w-full" dir="ltr">
                    {monthStats?.grossTotal === 0 && monthStats?.employeeCount === 0 ? (
                      <div className="flex h-full items-center justify-center text-xs text-app-label-tertiary" dir="rtl">
                        لم يتم احتساب المسير بعد لتوليد الرسم البياني.
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={monthStats?.compositionData}
                          layout="vertical"
                          margin={{ top: 10, right: 10, left: 20, bottom: 10 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(150,150,150,0.15)" />
                          {/* RTL reading: bars grow leftwards from the category labels, which sit outside the plot on the right. */}
                          <XAxis type="number" reversed tickFormatter={(v) => formatNumber(v)} tick={{ fontSize: 11 }} />
                          <YAxis
                            type="category"
                            dataKey="name"
                            orientation="right"
                            width={130}
                            tickLine={false}
                            tick={{ fontSize: 11, textAnchor: "start" }}
                            tickMargin={8}
                            interval={0}
                          />
                          <Tooltip
                            contentStyle={RTL_CHART_HTML}
                            formatter={(v: number | string | undefined) => [
                              `${formatNumber(v ?? 0)} د.ل`,
                              "المبلغ",
                            ]}
                          />
                          {/* Under the reversed axis recharts mirrors the radius (negative width), so this rounds the free left end. */}
                          <Bar dataKey="amount" radius={[0, 6, 6, 0]}>
                            {monthStats?.compositionData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.fill} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>

                {/* Visualization 2: Cost by Operating Unit */}
                <div className="rounded-2xl border border-app-separator bg-app-bg-primary p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Layers className="w-5 h-5 text-app-accent" />
                      <h3 className="text-sm font-bold text-app-label-primary">
                        توزيع تكلفة الرواتب حسب الوحدة التشغيلية
                      </h3>
                    </div>
                    <span className="text-xs font-mono text-app-label-secondary">
                      عدد الوحدات: {monthStats?.unitData.length ?? 0}
                    </span>
                  </div>

                  <div className="h-64 w-full" dir="ltr">
                    {!monthStats?.unitData || monthStats.unitData.length === 0 ? (
                      <div className="flex h-full items-center justify-center text-xs text-app-label-tertiary" dir="rtl">
                        لا توجد وحدات تشغيلية مسندة في هذا المسير.
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={monthStats.unitData} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(150,150,150,0.15)" />
                          {/* Long unit names are shortened (the tooltip shows the full name) and recharts' default auto-skip drops any that would still collide. */}
                          <XAxis dataKey="unit" tick={{ fontSize: 11 }} tickFormatter={shortUnitLabel} />
                          <YAxis tickFormatter={(v) => formatNumber(v)} tick={{ fontSize: 11 }} width={80} />
                          <Tooltip
                            contentStyle={RTL_CHART_HTML}
                            formatter={(v: number | string | undefined) => [
                              `${formatNumber(v ?? 0)} د.ل`,
                              "",
                            ]}
                          />
                          <Legend wrapperStyle={{ fontSize: 11, direction: "rtl" }} />
                          <Bar dataKey="gross" name="إجمالي المستحق" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="net" name="صافي الصرف" fill="#10b981" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>
              </div>

              {/* Deductions Breakdown Tags if any exist */}
              {monthStats?.deductionsData && monthStats.deductionsData.length > 0 && (
                <div className="rounded-2xl border border-app-separator bg-app-bg-primary p-4 shadow-sm">
                  <span className="text-xs font-bold text-app-label-primary block mb-2">
                    تفاصيل الاستقطاعات لشهر {activeRun.period}:
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    {monthStats.deductionsData.map((d) => (
                      <div
                        key={d.type}
                        className="flex items-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-700 dark:text-rose-300 font-mono"
                      >
                        <span className="font-bold">{d.type}:</span>
                        <span>{formatNumber(d.amount)} د.ل</span>
                        <span className="text-[10px] text-rose-500/70">({d.count} موظف)</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Detailed Payslips Table Card */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-app-accent" />
                    <h3 className="text-base font-bold text-app-label-primary">
                      قسائم رواتب الموظفين (تفاصيل شهر {activeRun.period})
                    </h3>
                  </div>
                  <span className="text-xs text-app-label-secondary font-mono">
                    إجمالي الموظفين: {monthStats?.employeeCount ?? 0}
                  </span>
                </div>

                {isPayslipsLoading ? (
                  <div className="flex h-48 items-center justify-center rounded-2xl border border-app-separator bg-app-bg-primary text-xs text-app-label-secondary">
                    جارٍ تحميل قسائم الرواتب…
                  </div>
                ) : payslips && payslips.length > 0 ? (
                  <PayslipsTable payslips={payslips} run={activeRun} onError={setError} />
                ) : (
                  <div className="rounded-2xl border border-app-separator bg-app-bg-primary p-8 text-center text-xs text-app-label-tertiary">
                    لم تُحتسب قسائم الرواتب بعد. اضغط على زر "احتساب المسير" أعلاه لتوليد القسائم آلياً.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* VIEW MODE: ALL MONTHS OVERVIEW */}
      {viewMode === "all" && (
        <div className="space-y-6">
          {/* Trend Chart Card */}
          <div className="rounded-2xl border border-app-separator bg-app-bg-primary p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-app-accent" />
                <h3 className="text-base font-bold text-app-label-primary">
                  مقارنة حركة الرواتب عبر الشهور (Payroll Expenses Trend)
                </h3>
              </div>
              <span className="text-xs font-mono text-app-label-secondary">
                إجمالي الفترات: {allRuns.length}
              </span>
            </div>

            <div className="h-72 w-full" dir="ltr">
              {trendData.length === 0 ? (
                <div className="flex h-full items-center justify-center text-xs text-app-label-tertiary" dir="rtl">
                  لا توجد بيانات مسيرات كافية لعرض الرسم البياني.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trendData} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(150,150,150,0.15)" />
                    <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(v) => formatNumber(v)} tick={{ fontSize: 11 }} width={80} />
                    <Tooltip
                      contentStyle={RTL_CHART_HTML}
                      formatter={(v: number | string | undefined) => [
                        `${formatNumber(v ?? 0)} د.ل`,
                        "",
                      ]}
                    />
                    <Legend wrapperStyle={{ fontSize: 11, direction: "rtl" }} />
                    <Bar dataKey="gross" name="إجمالي المستحق" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="net" name="صافي الصرف" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="deductions" name="الاستقطاعات" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* All Months Summary Grid / List */}
          <div className="rounded-2xl border border-app-separator bg-app-bg-primary shadow-sm overflow-hidden">
            <div className="border-b border-app-separator bg-app-bg-secondary px-5 py-3 flex items-center justify-between">
              <h3 className="text-xs font-bold text-app-label-primary">
                سجل كافة مسيرات الرواتب
              </h3>
              <span className="text-xs text-app-label-secondary">
                اضغط على أي شهر لعرض تفاصيله ورسومه البيانية
              </span>
            </div>

            {isAllRunsLoading ? (
              <div className="flex h-48 items-center justify-center text-xs text-app-label-secondary">
                جارٍ التحميل…
              </div>
            ) : allRuns.length === 0 ? (
              <div className="p-10 text-center text-xs text-app-label-tertiary">
                لا توجد مسيرات مسجلة حتى الآن.
              </div>
            ) : (
              <div className="divide-y divide-app-separator">
                {allRuns.map((run) => {
                  const next = nextActionFor(run);

                  return (
                    <div
                      key={run.id}
                      className="flex flex-wrap items-center justify-between gap-4 p-4 hover:bg-app-fill-f1 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => {
                            setSelectedPeriod(run.period);
                            setViewMode("month");
                          }}
                          className="font-mono font-bold text-app-accent text-sm hover:underline"
                        >
                          {run.period}
                        </button>
                        <span
                          className={`px-2.5 py-0.5 text-[10px] font-bold rounded-full border ${
                            STATUS_STYLE[run.status]
                          }`}
                        >
                          {PAYROLL_STATUS_LABEL[run.status]}
                        </span>
                        {run.status === "calculated" && run.needs_recalculation && (
                          <span className="px-2.5 py-0.5 text-[10px] font-bold rounded-full border bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30">
                            يحتاج إعادة احتساب
                          </span>
                        )}
                        <span className="text-xs text-app-label-secondary font-mono">
                          {run.payslips_count ?? 0} موظف
                        </span>
                      </div>

                      <div className="flex items-center gap-4 text-xs font-mono">
                        <div className="text-app-label-secondary">
                          <span>إجمالي: </span>
                          <span className="font-bold text-app-label-primary">{formatNumber(run.total_gross)}</span>
                        </div>
                        <div className="text-app-label-secondary">
                          <span>استقطاعات: </span>
                          <span className="font-bold text-rose-600 dark:text-rose-400">
                            {formatNumber(run.total_deductions)}
                          </span>
                        </div>
                        <div className="text-app-label-secondary">
                          <span>صافي: </span>
                          <span className="font-bold text-emerald-600 dark:text-emerald-400">
                            {formatNumber(run.total_net)}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {next && (
                          <button
                            onClick={() => act(run)}
                            disabled={actionMutation.isPending}
                            className="rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-1.5 text-xs font-bold text-app-label-primary hover:bg-app-fill-f1 transition-colors"
                          >
                            {next.label}
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setSelectedPeriod(run.period);
                            setViewMode("month");
                          }}
                          className="rounded-xl bg-app-accent px-3 py-1.5 text-xs font-bold text-white hover:opacity-90 transition-opacity"
                        >
                          عرض التفاصيل
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Post a paid run — pick the treasury net pay left from */}
      {postingRun && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-app-separator bg-app-bg-primary p-6 shadow-xl">
            <h3 className="text-lg font-bold text-app-label-primary flex items-center gap-2">
              <Banknote className="w-5 h-5 text-app-accent" />
              ترحيل مسير {postingRun.period}
            </h3>
            <p className="text-xs text-app-label-secondary mt-1">
              يُقيَّد صافي الرواتب ({formatNumber(Number(postingRun.total_net || 0))}) دائناً على الخزينة المختارة،
              والاستقطاعات على حساب استقطاعات الرواتب المستحقة.
            </p>

            <TreasurySelect
              value={postTreasuryId}
              onChange={setPostTreasuryId}
              label="الخزينة التي صُرفت منها الرواتب"
              className="mt-4 space-y-1"
            />

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPostingRun(null)}
                className="rounded-xl border border-app-separator bg-app-bg-secondary px-4 py-2 text-xs font-bold text-app-label-secondary hover:bg-app-fill-f1"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={postRun}
                disabled={!postTreasuryId || actionMutation.isPending}
                className="rounded-xl bg-app-accent px-4 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
              >
                {actionMutation.isPending ? "جارٍ الترحيل…" : "ترحيل للدفاتر"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={recalcRun !== null}
        onClose={() => setRecalcRun(null)}
        onConfirm={recalculateRun}
        title={recalcRun ? `إعادة احتساب مسير ${recalcRun.period}` : ""}
        message={recalcMessage}
        confirmText="إعادة الاحتساب"
        variant="warning"
        isLoading={actionMutation.isPending}
      />

      {/* Modal: Open New Payroll Run */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-app-separator bg-app-bg-primary p-6 shadow-xl">
            <h3 className="text-lg font-bold text-app-label-primary flex items-center gap-2">
              <Banknote className="w-5 h-5 text-app-accent" />
              فتح مسير رواتب جديد
            </h3>
            <p className="text-xs text-app-label-secondary mt-1">
              حدد الشهر لإنشاء مسير رواتب جديد. سيتمكن النظام من جمع سجلات الدوام وتكاليف الإنتاج واحتسابها.
            </p>

            <div className="mt-4">
              <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                فترة المسير (الشهر والسنة)
              </label>
              <input
                type="month"
                value={createPeriod}
                onChange={(e) => setCreatePeriod(e.target.value)}
                className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-sm font-mono text-app-label-primary focus:border-app-accent focus:outline-none"
              />
            </div>

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="rounded-xl border border-app-separator bg-app-bg-secondary px-4 py-2 text-xs font-bold text-app-label-secondary hover:bg-app-fill-f1"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => openRun(createPeriod)}
                disabled={openMutation.isPending}
                className="rounded-xl bg-app-accent px-4 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
              >
                {openMutation.isPending ? "جارٍ الفتح…" : `فتح مسير ${createPeriod}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
