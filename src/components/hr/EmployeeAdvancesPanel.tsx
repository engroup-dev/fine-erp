import React, { useCallback, useMemo, useState } from "react";
import { HandCoins, Plus } from "lucide-react";
import { DataTable, useDataTable } from "../ui/DataTable";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { SearchableSelect } from "../ui/SearchableSelect";
import { useEmployeeAdvancesColumns } from "../table-columns/employeeAdvancesColumns";
import { AdvanceDetailDialog, ErrorBox, PayAdvanceDialog, RepayAdvanceDialog, RequestAdvanceDialog } from "./AdvanceDialogs";
import {
  ADVANCE_APPROVER_ROLES,
  ADVANCE_STATUS_LABEL,
  ADVANCE_TYPE_LABEL,
  advanceErrorMessage,
  formatAdvanceMoney,
  type EmployeeAdvance,
  type EmployeeAdvanceStatus,
  type EmployeeAdvanceType,
} from "../../api/endpoints/employeeAdvances";
import { useApproveAdvance, useCancelAdvance, useEmployeeAdvances } from "../../hooks/useEmployeeAdvances";
import { useEmployees } from "../../hooks/useEmployees";
import { usePermissions } from "../../hooks/usePermissions";
import { formatNumber } from "../../lib/utils/format";
import type { Employee } from "../../types/entities";

const PER_PAGE = 25;

const actionButton =
  "rounded-lg px-2 py-1 text-[11px] font-bold transition-opacity hover:opacity-90 disabled:opacity-50";

interface EmployeeAdvancesPanelProps {
  /** On the employee card: only this employee's advances, and requests are for them. */
  employee?: Employee;
}

/**
 * W5-02 (HR-12): the advances list with request, approve, pay-out, repay and
 * cancel. Shared by the HR advances page and the employee card's tab.
 */
export const EmployeeAdvancesPanel: React.FC<EmployeeAdvancesPanelProps> = ({ employee }) => {
  const [status, setStatus] = useState<EmployeeAdvanceStatus | "">("");
  const [type, setType] = useState<EmployeeAdvanceType | "">("");
  // The list pages on the server, so the employee filter is a server filter too.
  const [employeeFilter, setEmployeeFilter] = useState<Employee | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [isRequestOpen, setIsRequestOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [paying, setPaying] = useState<EmployeeAdvance | null>(null);
  const [repaying, setRepaying] = useState<EmployeeAdvance | null>(null);
  const [cancelling, setCancelling] = useState<EmployeeAdvance | null>(null);

  const { hasRole, hasPermission } = usePermissions();
  // HR (manage-hr) requests and cancels a request; approve-advances holders approve,
  // pay out, repay and cancel an approval (EmployeeAdvanceController).
  const canRequest = hasPermission("manage-hr");
  const canApprove = hasRole(ADVANCE_APPROVER_ROLES) && hasPermission("approve-advances");

  // Deleted employees too: an advance they still owe stays listed.
  const { data: allEmployees = [], isLoading: employeesLoading } = useEmployees(employee ? undefined : { with_trashed: 1 });
  const employeeOptions = useMemo(() => (employee ? [] : allEmployees), [employee, allEmployees]);

  const { data, isLoading, isError, error: loadError } = useEmployeeAdvances({
    employee_id: employee?.id ?? employeeFilter?.id,
    status: status || undefined,
    type: type || undefined,
    page,
    per_page: PER_PAGE,
  });
  const approve = useApproveAdvance();
  const cancel = useCancelAdvance();

  const advances = data?.data ?? [];
  const lastPage = data?.meta?.last_page ?? 1;

  const approveMutate = approve.mutate;
  const doApprove = useCallback(
    (advance: EmployeeAdvance) => {
      setError(null);
      approveMutate(advance.id, { onError: (err) => setError(advanceErrorMessage(err, "تعذر اعتماد السلفة.")) });
    },
    [approveMutate],
  );

  const confirmCancel = () => {
    if (!cancelling) return;
    setError(null);
    cancel.mutate(cancelling.id, {
      onSuccess: () => setCancelling(null),
      onError: (err) => {
        setCancelling(null);
        setError(advanceErrorMessage(err, "تعذر إلغاء السلفة."));
      },
    });
  };

  const renderActions = useCallback(
    (advance: EmployeeAdvance) => {
      const mayCancel =
        (advance.status === "requested" && (canRequest || canApprove)) || (advance.status === "approved" && canApprove);
      const employeeDeleted = Boolean(advance.employee?.deleted_at);
      return (
        <div className="flex flex-wrap items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
          {advance.status === "requested" && canApprove && !employeeDeleted && (
            <button
              type="button"
              onClick={() => doApprove(advance)}
              disabled={approve.isPending}
              className={`${actionButton} bg-app-accent text-white`}
            >
              اعتماد
            </button>
          )}
          {advance.status === "approved" && canApprove && !employeeDeleted && (
            <button type="button" onClick={() => setPaying(advance)} className={`${actionButton} bg-app-accent text-white`}>
              صرف
            </button>
          )}
          {advance.status === "paid" && canApprove && (
            <button
              type="button"
              onClick={() => setRepaying(advance)}
              className={`${actionButton} border border-app-separator text-app-label-primary`}
            >
              سداد نقدي
            </button>
          )}
          {mayCancel && (
            <button
              type="button"
              onClick={() => setCancelling(advance)}
              className={`${actionButton} border border-app-status-danger/40 text-app-status-danger`}
            >
              إلغاء
            </button>
          )}
        </div>
      );
    },
    [canRequest, canApprove, doApprove, approve.isPending],
  );

  const columns = useEmployeeAdvancesColumns({ showEmployee: !employee, renderActions });
  const table = useDataTable({
    exportFileName: "employee-advances",
    columns,
    data: advances,
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
      {isError && <ErrorBox message={advanceErrorMessage(loadError, "تعذر تحميل السلف.")} />}

      <DataTable table={table}>
        <DataTable.Header>
          <DataTable.Toolbar>
            {!employee && (
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
            )}
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as EmployeeAdvanceStatus | "");
                setPage(1);
              }}
              className={selectClass}
              aria-label="الحالة"
            >
              <option value="">كل الحالات</option>
              {(Object.keys(ADVANCE_STATUS_LABEL) as EmployeeAdvanceStatus[]).map((s) => (
                <option key={s} value={s}>
                  {ADVANCE_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
            <select
              value={type}
              onChange={(e) => {
                setType(e.target.value as EmployeeAdvanceType | "");
                setPage(1);
              }}
              className={selectClass}
              aria-label="النوع"
            >
              <option value="">سلف وقروض</option>
              {(Object.keys(ADVANCE_TYPE_LABEL) as EmployeeAdvanceType[]).map((t) => (
                <option key={t} value={t}>
                  {ADVANCE_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </DataTable.Toolbar>
          <DataTable.Actions>
            {data?.meta?.total != null && (
              <span className="text-xs font-mono text-app-label-secondary">العدد: {formatNumber(data.meta.total)}</span>
            )}
            {canRequest && (
              <button
                type="button"
                onClick={() => setIsRequestOpen(true)}
                disabled={employee?.status === "terminated"}
                className="flex items-center gap-1.5 rounded-xl bg-app-accent px-3 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" /> طلب سلفة / قرض
              </button>
            )}
          </DataTable.Actions>
        </DataTable.Header>
        <DataTable.Content
          isLoading={isLoading}
          emptyMessage="لا توجد سلف أو قروض."
          emptyIcon={HandCoins}
          onRowClick={(a: EmployeeAdvance) => {
            setError(null);
            setDetailId(a.id);
          }}
        />
      </DataTable>

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

      <RequestAdvanceDialog open={isRequestOpen} onOpenChange={setIsRequestOpen} employee={employee} />
      <AdvanceDetailDialog
        advanceId={detailId}
        onClose={() => {
          setDetailId(null);
          setError(null);
        }}
        renderActions={renderActions}
        actionError={error}
      />
      <PayAdvanceDialog advance={paying} onClose={() => setPaying(null)} />
      <RepayAdvanceDialog advance={repaying} onClose={() => setRepaying(null)} />
      <ConfirmDialog
        isOpen={Boolean(cancelling)}
        onClose={() => setCancelling(null)}
        onConfirm={confirmCancel}
        title="إلغاء السلفة"
        message={
          cancelling
            ? `إلغاء ${ADVANCE_TYPE_LABEL[cancelling.type]} بمبلغ ${formatAdvanceMoney(cancelling.amount)} د.ل للموظف ${
                cancelling.employee?.name ?? ""
              }؟ يُلغى جدول أقساطها معها، ولا رجعة في الإلغاء.`
            : ""
        }
        confirmText="إلغاء السلفة"
        cancelText="تراجع"
        variant="danger"
        isLoading={cancel.isPending}
      />
    </div>
  );
};
