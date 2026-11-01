import React, { useCallback, useMemo, useState } from "react";
import { Gift, Plus } from "lucide-react";
import { DataTable, useDataTable } from "../ui/DataTable";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { SearchableSelect } from "../ui/SearchableSelect";
import { ErrorBox, currentPeriod } from "./AdvanceDialogs";
import { AdjustmentDialog, isOnPayroll } from "./PayItemDialogs";
import { useEmployeeAdjustmentsColumns } from "../table-columns/employeeAdjustmentsColumns";
import {
  ADJUSTMENT_APPROVER_ROLES,
  ADJUSTMENT_KIND_LABEL,
  ADJUSTMENT_STATUS_LABEL,
  formatPayMoney,
  payItemErrorMessage,
  type EmployeeAdjustment,
  type EmployeeAdjustmentStatus,
  type PayItemKind,
} from "../../api/endpoints/payItems";
import {
  useApproveAdjustment,
  useDeleteAdjustment,
  useEmployeeAdjustments,
  usePayCodes,
} from "../../hooks/usePayItems";
import { useEmployees } from "../../hooks/useEmployees";
import { usePermissions } from "../../hooks/usePermissions";
import { formatNumber } from "../../lib/utils/format";
import type { Employee } from "../../types/entities";

const PER_PAGE = 25;

const actionButton =
  "rounded-lg px-2 py-1 text-[11px] font-bold transition-opacity hover:opacity-90 disabled:opacity-50";

interface EmployeeAdjustmentsPanelProps {
  /** On the employee card: only this employee's adjustments, every month. */
  employee?: Employee;
}

/**
 * W5-03 (HR-13): one-off rewards and deductions with entry, draft edit,
 * approval and removal. Shared by the monthly adjustments page (month filter,
 * defaulting to this month) and the employee card.
 */
export const EmployeeAdjustmentsPanel: React.FC<EmployeeAdjustmentsPanelProps> = ({ employee }) => {
  const [period, setPeriod] = useState(employee ? "" : currentPeriod());
  const [status, setStatus] = useState<EmployeeAdjustmentStatus | "">("");
  const [kind, setKind] = useState<PayItemKind | "">("");
  const [employeeFilter, setEmployeeFilter] = useState<Employee | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editing, setEditing] = useState<EmployeeAdjustment | null>(null);
  const [removing, setRemoving] = useState<EmployeeAdjustment | null>(null);

  const { hasRole, hasPermission } = usePermissions();
  // HR (manage-hr) enters, edits and removes drafts; approve-pay-adjustments holders
  // approve and remove an approved one (EmployeeAdjustmentController).
  const canEnter = hasPermission("manage-hr");
  const canApprove = hasRole(ADJUSTMENT_APPROVER_ROLES) && hasPermission("approve-pay-adjustments");

  const { nameOf } = usePayCodes();
  const { data: allEmployees = [], isLoading: employeesLoading } = useEmployees(employee ? undefined : { with_trashed: 1 });
  const employeeOptions = useMemo(() => (employee ? [] : allEmployees), [employee, allEmployees]);

  const { data, isLoading, isError, error: loadError } = useEmployeeAdjustments({
    employee_id: employee?.id ?? employeeFilter?.id,
    period: period || undefined,
    status: status || undefined,
    kind: kind || undefined,
    page,
    per_page: PER_PAGE,
  });
  const approve = useApproveAdjustment();
  const remove = useDeleteAdjustment();

  const adjustments = useMemo(() => data?.data ?? [], [data]);
  const lastPage = data?.meta?.last_page ?? 1;

  // Totals of what is on this page, approved only (drafts do not reach payroll).
  const approvedTotals = useMemo(
    () =>
      adjustments
        .filter((a) => a.status === "approved")
        .reduce(
          (acc, a) => {
            acc[a.kind] += Number(a.amount || 0);
            return acc;
          },
          { addition: 0, deduction: 0 } as Record<PayItemKind, number>,
        ),
    [adjustments],
  );

  const approveMutate = approve.mutate;
  const doApprove = useCallback(
    (adjustment: EmployeeAdjustment) => {
      setError(null);
      approveMutate(adjustment.id, {
        onError: (err) => setError(payItemErrorMessage(err, "تعذر اعتماد المكافأة أو الجزاء.")),
      });
    },
    [approveMutate],
  );

  const confirmRemove = () => {
    if (!removing) return;
    setError(null);
    remove.mutate(removing.id, {
      onSuccess: () => setRemoving(null),
      onError: (err) => {
        setRemoving(null);
        setError(payItemErrorMessage(err, "تعذر الحذف."));
      },
    });
  };

  const renderActions = useCallback(
    (adjustment: EmployeeAdjustment) => {
      const isDraft = adjustment.status === "draft";
      const mayRemove = isDraft ? canEnter || canApprove : canApprove;
      return (
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {isDraft && canApprove && (
            <button
              type="button"
              onClick={() => doApprove(adjustment)}
              disabled={approve.isPending}
              className={`${actionButton} bg-app-accent text-white`}
            >
              اعتماد
            </button>
          )}
          {isDraft && canEnter && (
            <button
              type="button"
              onClick={() => {
                setError(null);
                setEditing(adjustment);
              }}
              className={`${actionButton} border border-app-separator text-app-label-primary`}
            >
              تعديل
            </button>
          )}
          {mayRemove && (
            <button
              type="button"
              onClick={() => setRemoving(adjustment)}
              className={`${actionButton} border border-app-status-danger/40 text-app-status-danger`}
            >
              حذف
            </button>
          )}
        </div>
      );
    },
    [canEnter, canApprove, doApprove, approve.isPending],
  );

  const columns = useEmployeeAdjustmentsColumns({ showEmployee: !employee, nameOf, renderActions });
  const table = useDataTable({
    exportFileName: "employee-adjustments",
    columns,
    data: adjustments,
    // Sorting and a global filter would only reach the loaded page.
    enableSorting: false,
    enableGlobalFilter: false,
    enablePagination: false,
    getRowId: (a) => a.id,
  });

  const selectClass =
    "rounded-xl border border-app-separator bg-app-bg-primary px-2.5 py-1.5 text-xs text-app-label-primary focus:border-app-accent focus:outline-none";

  return (
    <div className="space-y-3">
      {error && <ErrorBox message={error} />}
      {isError && <ErrorBox message={payItemErrorMessage(loadError, "تعذر تحميل المكافآت والجزاءات.")} />}

      <DataTable table={table}>
        <DataTable.Header>
          <DataTable.Toolbar>
            {!employee && (
              <>
                <div className="flex items-center gap-1">
                  <input
                    type="month"
                    value={period}
                    onChange={(e) => {
                      setPeriod(e.target.value);
                      setPage(1);
                    }}
                    className={`${selectClass} font-mono`}
                    aria-label="الشهر"
                  />
                  {period ? (
                    <button
                      type="button"
                      onClick={() => {
                        setPeriod("");
                        setPage(1);
                      }}
                      className="text-[11px] text-app-label-secondary hover:text-app-accent"
                    >
                      كل الأشهر
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setPeriod(currentPeriod());
                        setPage(1);
                      }}
                      className="text-[11px] text-app-label-secondary hover:text-app-accent"
                    >
                      الشهر الحالي
                    </button>
                  )}
                </div>
                <SearchableSelect<Employee>
                  options={employeeOptions}
                  value={employeeFilter}
                  onChange={(emp) => {
                    setEmployeeFilter(emp);
                    setPage(1);
                  }}
                  getOptionId={(emp) => emp.id}
                  getOptionLabel={(emp) => (emp.entity?.name ?? emp.job_title ?? emp.id) + (emp.deleted_at ? " (محذوف)" : "")}
                  getOptionSubLabel={(emp) => [emp.employee_number, emp.job_title].filter(Boolean).join(" · ")}
                  getOptionSearchText={(emp) => `${emp.entity?.name ?? ""} ${emp.employee_number ?? ""} ${emp.job_title ?? ""}`}
                  placeholder="كل الموظفين"
                  emptyMessage="لا يوجد موظف بهذا الاسم أو الرقم."
                  loading={employeesLoading}
                  clearable
                  size="sm"
                  className="w-56"
                  ariaLabel="الموظف"
                />
              </>
            )}
            <select
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as PayItemKind | "");
                setPage(1);
              }}
              className={selectClass}
              aria-label="النوع"
            >
              <option value="">مكافآت وجزاءات</option>
              {(Object.keys(ADJUSTMENT_KIND_LABEL) as PayItemKind[]).map((k) => (
                <option key={k} value={k}>
                  {ADJUSTMENT_KIND_LABEL[k]}
                </option>
              ))}
            </select>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as EmployeeAdjustmentStatus | "");
                setPage(1);
              }}
              className={selectClass}
              aria-label="الحالة"
            >
              <option value="">كل الحالات</option>
              {(Object.keys(ADJUSTMENT_STATUS_LABEL) as EmployeeAdjustmentStatus[]).map((s) => (
                <option key={s} value={s}>
                  {ADJUSTMENT_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </DataTable.Toolbar>
          <DataTable.Actions>
            {data?.meta?.total != null && (
              <span className="text-xs font-mono text-app-label-secondary">العدد: {formatNumber(data.meta.total)}</span>
            )}
            {canEnter && (
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setIsCreateOpen(true);
                }}
                disabled={employee ? !isOnPayroll(employee) : false}
                className="flex items-center gap-1.5 rounded-xl bg-app-accent px-3 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" /> مكافأة / جزاء
              </button>
            )}
          </DataTable.Actions>
        </DataTable.Header>
        <DataTable.Content isLoading={isLoading} emptyMessage="لا توجد مكافآت أو جزاءات." emptyIcon={Gift} />
      </DataTable>

      {(approvedTotals.addition > 0 || approvedTotals.deduction > 0) && (
        <p className="text-[11px] text-app-label-secondary">
          المعتمد في هذه الصفحة: مكافآت{" "}
          <span className="font-mono font-bold text-app-status-positive">{formatPayMoney(approvedTotals.addition)} د.ل</span>
          {" "}· جزاءات{" "}
          <span className="font-mono font-bold text-app-status-danger">{formatPayMoney(approvedTotals.deduction)} د.ل</span>
        </p>
      )}

      {lastPage > 1 && (
        <div className="flex items-center justify-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded-lg border border-app-separator px-3 py-1.5 disabled:opacity-40"
          >
            السابق
          </button>
          <span className="text-app-label-secondary">
            {page} / {lastPage}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
            disabled={page >= lastPage}
            className="rounded-lg border border-app-separator px-3 py-1.5 disabled:opacity-40"
          >
            التالي
          </button>
        </div>
      )}

      {isCreateOpen && (
        <AdjustmentDialog
          open
          onOpenChange={setIsCreateOpen}
          employee={employee}
          defaultPeriod={period || undefined}
        />
      )}
      {editing && (
        <AdjustmentDialog
          key={editing.id}
          open
          onOpenChange={(next) => !next && setEditing(null)}
          adjustment={editing}
        />
      )}
      <ConfirmDialog
        isOpen={Boolean(removing)}
        onClose={() => setRemoving(null)}
        onConfirm={confirmRemove}
        title="حذف المكافأة أو الجزاء"
        message={
          removing
            ? `حذف ${ADJUSTMENT_KIND_LABEL[removing.kind]} بمبلغ ${formatPayMoney(removing.amount)} د.ل لشهر ${removing.period}${
                removing.employee?.name ? ` للموظف ${removing.employee.name}` : ""
              }؟${removing.status === "approved" ? " هي معتمدة، فيُعلَّم مسير الشهر المحتسب لإعادة الاحتساب." : ""}`
            : ""
        }
        confirmText="حذف"
        cancelText="تراجع"
        variant="danger"
        isLoading={remove.isPending}
      />
    </div>
  );
};
