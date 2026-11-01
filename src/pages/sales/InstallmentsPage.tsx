import React, { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, CalendarClock, FileSpreadsheet, Filter, Hash, Wallet, X } from "lucide-react";
import { useInstallments } from "../../hooks/useInstallments";
import { useClients } from "../../hooks/useClients";
import { usePermissions } from "../../hooks/usePermissions";
import { navItems } from "../../routes/routes.config";
import {
  INSTALLMENT_REPORT_STATUS_LABEL,
  INSTALLMENT_STATUS_LABEL,
  InstallmentReportRow,
  InstallmentReportStatus,
} from "../../api/endpoints/installments";
import { apiErrorMessage } from "../../api/endpoints/production";
import { DataTable, useDataTable } from "../../components/ui/DataTable";
import type { ColumnDef } from "../../components/ui/DataTable";
import { SearchableSelect } from "../../components/ui/SearchableSelect";
import { InstallmentStatusChip } from "../../components/sales/InstallmentSchedule";
import { downloadCsv, toCsv } from "../../lib/utils/csv";
import { formatDate, formatInteger, formatNumber, localDateIso } from "../../lib/utils/format";

const STATUSES: InstallmentReportStatus[] = ["due", "overdue", "all"];

const amount = (v: number | string): string => formatNumber(v, { maximumFractionDigits: 3 });
const isStatus = (v: string | null): v is InstallmentReportStatus => v !== null && (STATUSES as string[]).includes(v);

interface ClientOption {
  id: string;
  name: string;
}

/**
 * W5-08 (decision #6): «الأقساط» — installments across the unit's credit
 * sales on installments, with days overdue and totals. «غير المسددة» lists
 * every installment still to pay (due or not yet due), «المتأخرة» only those
 * past their due date. Filters live in the URL so the client card can link
 * here with ?client_id=.
 */
export const InstallmentsPage: React.FC = () => {
  const navigate = useNavigate();
  const { canAccess } = usePermissions();
  // A sale's page sits under the POS route; accounting and treasury readers see the list only.
  const canOpenSale = canAccess(navItems.find((item) => item.id === "pos"));
  // GET /clients is narrower than the report (treasury and cutter readers get a 403), so only
  // those who may list clients load them; the rest pick from the clients in the report itself.
  const canListClients = canAccess(navItems.find((item) => item.id === "clients"));
  const [searchParams, setSearchParams] = useSearchParams();
  const statusParam = searchParams.get("status");
  const status: InstallmentReportStatus = isStatus(statusParam) ? statusParam : "due";
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  const clientId = searchParams.get("client_id") ?? "";
  const rangeInvalid = Boolean(from && to && to < from);

  const setParam = (key: string, value: string) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );

  const { data, isLoading, isFetching, error } = useInstallments(
    {
      status,
      from: from || undefined,
      to: to || undefined,
      client_id: clientId || undefined,
    },
    !rangeInvalid,
  );
  const { data: clients, isLoading: clientsLoading } = useClients(undefined, canListClients);

  const rows = useMemo(() => data?.data ?? [], [data]);
  const totals = data?.totals;
  const clientOptions = useMemo<ClientOption[]>(() => {
    if (canListClients) return (clients ?? []).map((c) => ({ id: c.id, name: c.entity?.name ?? c.id }));
    const seen = new Map<string, string>();
    rows.forEach((r) => {
      if (!seen.has(r.client_id)) seen.set(r.client_id, r.client_name ?? r.client_id);
    });
    return Array.from(seen, ([id, name]) => ({ id, name }));
  }, [canListClients, clients, rows]);
  const selectedClient = clientOptions.find((c) => c.id === clientId) ?? null;
  // A client filter from a link stays visible even when that client is not among the options.
  const selectedClientLabel = selectedClient
    ? selectedClient.name
    : clientId
      ? rows.find((r) => r.client_id === clientId)?.client_name ?? "عميل محدد"
      : "";

  const columns = useMemo<ColumnDef<InstallmentReportRow, unknown>[]>(
    () => [
      {
        id: "due_date",
        accessorKey: "due_date",
        header: "تاريخ الاستحقاق",
        meta: { className: "font-mono text-xs" },
        cell: ({ row }) => formatDate(row.original.due_date),
      },
      {
        id: "order_number",
        accessorKey: "order_number",
        header: "رقم البيع",
        meta: { className: "font-mono text-xs font-bold text-app-accent" },
      },
      {
        id: "client_name",
        accessorKey: "client_name",
        header: "العميل",
        cell: ({ row }) => <span className="text-xs font-semibold text-app-label-primary">{row.original.client_name ?? "—"}</span>,
      },
      {
        id: "number",
        header: "القسط",
        enableSorting: false,
        meta: { className: "font-mono text-xs text-app-label-secondary" },
        cell: ({ row }) => `${row.original.number} / ${row.original.installment_count}`,
      },
      {
        id: "amount",
        accessorFn: (r) => Number(r.amount),
        header: "قيمة القسط",
        meta: { className: "font-mono", align: "end" },
        cell: ({ row }) => amount(row.original.amount),
      },
      {
        id: "paid_amount",
        accessorFn: (r) => Number(r.paid_amount),
        header: "المدفوع",
        meta: { className: "font-mono text-app-label-secondary", align: "end" },
        cell: ({ row }) => amount(row.original.paid_amount),
      },
      {
        id: "remaining",
        accessorFn: (r) => Number(r.remaining),
        header: "المتبقي",
        meta: { className: "font-mono", align: "end" },
        cell: ({ row }) => <span className="font-bold text-app-label-primary">{amount(row.original.remaining)}</span>,
      },
      {
        id: "status",
        accessorKey: "status",
        header: "الحالة",
        cell: ({ row }) => <InstallmentStatusChip line={row.original} />,
      },
      {
        id: "days_overdue",
        accessorKey: "days_overdue",
        header: "أيام التأخير",
        meta: { className: "font-mono", align: "end" },
        cell: ({ row }) =>
          row.original.days_overdue > 0 ? (
            <span className="font-bold text-app-status-danger">{formatInteger(row.original.days_overdue)}</span>
          ) : (
            <span className="text-app-label-tertiary">—</span>
          ),
      },
    ],
    [],
  );

  const table = useDataTable({
    // One CSV button per grid: the page's own CSV button exports this report.
    enableExport: false,
    columns,
    data: rows,
    enableSorting: true,
    pageSize: 25,
    getRowId: (r) => r.id,
  });

  const exportCsv = () => {
    const csv = toCsv<InstallmentReportRow>(rows, [
      { header: "تاريخ الاستحقاق", value: (r) => r.due_date },
      { header: "رقم البيع", value: (r) => r.order_number },
      { header: "العميل", value: (r) => r.client_name },
      { header: "رقم القسط", value: (r) => r.number, decimals: 0 },
      { header: "عدد الأقساط", value: (r) => r.installment_count, decimals: 0 },
      { header: "قيمة القسط", value: (r) => Number(r.amount), decimals: 3 },
      { header: "المدفوع", value: (r) => Number(r.paid_amount), decimals: 3 },
      { header: "المتبقي", value: (r) => Number(r.remaining), decimals: 3 },
      { header: "الحالة", value: (r) => r.status_label || INSTALLMENT_STATUS_LABEL[r.status] || r.status },
      { header: "أيام التأخير", value: (r) => r.days_overdue, decimals: 0 },
    ]);
    downloadCsv(`installments-${status}-${localDateIso()}.csv`, csv);
  };

  const cards = [
    { label: "عدد الأقساط", value: formatInteger(totals?.count ?? 0), icon: Hash, tone: "bg-app-accent/10 text-app-accent" },
    { label: "قيمة الأقساط", value: amount(totals?.amount ?? 0), icon: CalendarClock, tone: "bg-app-fill-f1 text-app-label-secondary" },
    { label: "المدفوع منها", value: amount(totals?.paid ?? 0), icon: Wallet, tone: "bg-app-status-positive/10 text-app-status-positive" },
    { label: "المتبقي", value: amount(totals?.remaining ?? 0), icon: Wallet, tone: "bg-app-accent/10 text-app-accent" },
    { label: "المتأخر", value: amount(totals?.overdue ?? 0), icon: AlertTriangle, tone: "bg-app-status-danger/10 text-app-status-danger" },
  ];

  return (
    <div className="space-y-6 p-6" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-app-label-primary flex items-center gap-2">
            <CalendarClock className="w-7 h-7 text-app-accent" />
            الأقساط
          </h1>
          <p className="text-xs text-app-label-secondary mt-1">
            أقساط المبيعات الآجلة المقسّطة في الوحدة الحالية. «غير المسددة» تشمل كل قسط لم يُسدد بعد، مستحقاً كان أو قادماً؛
            و«المتأخرة» ما تجاوز تاريخ استحقاقه فقط. تُحسب الحالة من تحصيلات البيع نفسه (أقدم قسط أولاً)
            {data?.as_of ? <> حتى <span className="font-mono">{formatDate(data.as_of)}</span></> : null}.
          </p>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          disabled={rows.length === 0}
          className="flex shrink-0 items-center gap-1.5 rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-1.5 text-xs font-semibold text-app-label-primary hover:bg-app-fill-f1 disabled:opacity-40"
        >
          <FileSpreadsheet className="w-4 h-4" /> CSV
        </button>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center gap-3 bg-app-bg-primary p-4 rounded-2xl border border-app-separator shadow-sm">
        <Filter className="hidden lg:block w-4 h-4 text-app-label-secondary" />
        <div className="flex items-center gap-1">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setParam("status", s === "due" ? "" : s)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                status === s ? "bg-app-accent text-white" : "bg-app-fill-f1 text-app-label-secondary hover:text-app-label-primary"
              }`}
            >
              {INSTALLMENT_REPORT_STATUS_LABEL[s]}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-app-label-secondary">
          الاستحقاق من
          <input
            type="date"
            value={from}
            onChange={(e) => setParam("from", e.target.value)}
            className="rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs font-mono focus:border-app-accent focus:outline-none"
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-app-label-secondary">
          إلى
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => setParam("to", e.target.value)}
            className="rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs font-mono focus:border-app-accent focus:outline-none"
          />
        </label>
        <div className="min-w-[14rem]">
          {clientId && !selectedClient ? (
            <div className="flex items-center justify-between gap-2 rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-1.5 text-xs">
              <span className="font-semibold text-app-label-primary">{selectedClientLabel}</span>
              <button type="button" onClick={() => setParam("client_id", "")} aria-label="إزالة العميل">
                <X className="h-3.5 w-3.5 text-app-label-secondary" />
              </button>
            </div>
          ) : (
            <SearchableSelect<ClientOption>
              options={clientOptions}
              value={selectedClient}
              onChange={(c) => setParam("client_id", c ? c.id : "")}
              getOptionId={(c) => c.id}
              getOptionLabel={(c) => c.name}
              placeholder="كل العملاء"
              loading={canListClients ? clientsLoading : isLoading}
              size="sm"
              ariaLabel="العميل"
            />
          )}
        </div>
        {rangeInvalid && <span className="text-[11px] text-app-status-danger">تاريخ النهاية قبل تاريخ البداية.</span>}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="bg-app-bg-primary p-4 rounded-2xl border border-app-separator shadow-sm flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${c.tone}`}>
              <c.icon className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-semibold text-app-label-secondary">{c.label}</div>
              <div className="text-xl font-bold font-mono text-app-label-primary">{c.value}</div>
            </div>
          </div>
        ))}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-2xl border border-app-status-danger/30 bg-app-status-danger/10 p-4 text-xs text-app-status-danger">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{apiErrorMessage(error, "تعذّر تحميل الأقساط.")}</span>
        </div>
      )}

      <DataTable table={table}>
        <DataTable.Content
          isLoading={isLoading || (isFetching && rows.length === 0)}
          emptyMessage={status === "overdue" ? "لا توجد أقساط متأخرة بهذه الشروط." : "لا توجد أقساط بهذه الشروط."}
          emptyIcon={CalendarClock}
          onRowClick={canOpenSale ? (r: InstallmentReportRow) => navigate(`/sales/${r.sales_order_id}`) : undefined}
        />
        <DataTable.Pagination />
      </DataTable>
    </div>
  );
};

export default InstallmentsPage;
