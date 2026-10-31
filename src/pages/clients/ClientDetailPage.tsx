import React, { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowRight, CalendarClock, Clock, FileSpreadsheet, History, MapPin, ShoppingCart, User } from "lucide-react";
import { useClient, useClientSummary } from "../../hooks/useClients";
import type { ClientLastPayment, ClientOpenSale, ClientSummary } from "../../api/endpoints/clients";
import { useSales } from "../../hooks/useSales";
import { Sale } from "../../api/endpoints/sales";
import { DataTable, useDataTable } from "../../components/ui/DataTable";
import { useSalesColumns } from "../../components/table-columns/salesColumns";
import type { ClientStatus, EntityType } from "../../types/entities";
import { formatDate, formatNumber } from "../../lib/utils/format";
import { useInstallments } from "../../hooks/useInstallments";
import { usePermissions } from "../../hooks/usePermissions";
import { INSTALLMENT_PERMISSION, INSTALLMENT_ROLES } from "../../api/endpoints/installments";
import { InstallmentStatusChip } from "../../components/sales/InstallmentSchedule";
import { navItems } from "../../routes/routes.config";
import { ClientAddressesTab } from "./ClientAddressesTab";
import { ClientCreditHistoryTab } from "./ClientCreditHistoryTab";

const STATUS_LABEL: Record<ClientStatus, string> = {
  active: "نشط",
  suspended: "موقوف",
  blacklisted: "قائمة سوداء",
};

const ENTITY_TYPE_LABEL: Record<EntityType, string> = {
  individual: "فرد",
  organization: "مؤسسة",
};

const money = (v: string | number | null | undefined) => Number(v ?? 0).toLocaleString();

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <div className="text-[11px] font-semibold text-app-label-secondary">{label}</div>
    <div className="text-sm text-app-label-primary mt-0.5">{children}</div>
  </div>
);

const LAST_PAYMENT_METHOD_LABEL: Record<string, string> = {
  cash: "نقداً",
  bank: "مصرف",
  cheque: "شيك",
  voucher: "إيصال قبض",
};

const lastPaymentText = (p: ClientLastPayment): string =>
  [LAST_PAYMENT_METHOD_LABEL[p.method ?? ""] ?? p.method, p.reference].filter(Boolean).join(" · ");

/**
 * W5-05: the receivable's age from the ledger (the debtor-statement figures), what is past the
 * payment terms, the last collection and the sales still open — all as of today, across units.
 */
const AgingWidgets: React.FC<{ summary?: ClientSummary; isLoading: boolean; isError: boolean }> = ({
  summary,
  isLoading,
  isError,
}) => {
  if (isError) {
    return <p className="text-xs text-app-status-danger">تعذر تحميل أعمار الذمة.</p>;
  }
  if (isLoading || !summary) {
    return <p className="text-xs text-app-label-secondary">جارٍ تحميل أعمار الذمة…</p>;
  }
  const buckets = [
    { label: "0–30 يوماً", value: summary.aging.current, tone: "bg-app-status-positive" },
    { label: "31–60 يوماً", value: summary.aging.days_31_60, tone: "bg-app-status-yellow" },
    { label: "61–90 يوماً", value: summary.aging.days_61_90, tone: "bg-app-status-orange" },
    { label: "أكثر من 90 يوماً", value: summary.aging.over_90, tone: "bg-app-status-danger" },
  ];
  const agingTotal = buckets.reduce((acc, b) => acc + Math.max(0, Number(b.value)), 0);
  const overdue = Number(summary.overdue_amount);

  return (
    <div className="space-y-3">
      <div className="bg-app-bg-primary p-4 rounded-2xl border border-app-separator shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xs font-bold text-app-label-primary">أعمار الذمة</h2>
          <span className="text-[11px] text-app-label-secondary">
            رصيد الدفتر <span className="font-mono font-semibold text-app-label-primary">{money(summary.balance)}</span> د.ل ·
            حتى <span className="font-mono">{formatDate(summary.as_of)}</span>
          </span>
        </div>
        {agingTotal > 0 && (
          <div className="flex h-2 overflow-hidden rounded-full bg-app-fill-f1">
            {buckets.map((b) =>
              Number(b.value) > 0 ? (
                <div key={b.label} className={b.tone} style={{ width: `${(Number(b.value) / agingTotal) * 100}%` }} />
              ) : null,
            )}
          </div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {buckets.map((b) => (
            <div key={b.label}>
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-app-label-secondary">
                <span className={`h-2 w-2 rounded-full ${b.tone}`} />
                {b.label}
              </div>
              <div className="text-sm font-bold font-mono text-app-label-primary mt-0.5">{money(b.value)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div
          className={`p-4 rounded-2xl border shadow-sm ${
            overdue > 0 ? "border-app-status-danger/40 bg-app-status-danger/5" : "border-app-separator bg-app-bg-primary"
          }`}
        >
          <div className="flex items-center gap-1.5 text-xs font-semibold text-app-label-secondary">
            {overdue > 0 && <AlertTriangle className="h-3.5 w-3.5 text-app-status-danger" />}
            متأخر عن مدة السداد
          </div>
          <div className={`text-xl font-bold font-mono mt-1 ${overdue > 0 ? "text-app-status-danger" : "text-app-label-primary"}`}>
            {money(overdue)}
          </div>
        </div>
        <div className="bg-app-bg-primary p-4 rounded-2xl border border-app-separator shadow-sm">
          <div className="text-xs font-semibold text-app-label-secondary">آخر دفعة</div>
          {summary.last_payment ? (
            <>
              <div className="text-xl font-bold font-mono text-app-label-primary mt-1">{money(summary.last_payment.amount)}</div>
              <div className="text-[11px] text-app-label-secondary mt-0.5">
                <span className="font-mono">{formatDate(summary.last_payment.date)}</span>
                {lastPaymentText(summary.last_payment) && ` · ${lastPaymentText(summary.last_payment)}`}
              </div>
            </>
          ) : (
            <div className="text-sm text-app-label-tertiary mt-1">لا توجد تحصيلات</div>
          )}
        </div>
        <div className="bg-app-bg-primary p-4 rounded-2xl border border-app-separator shadow-sm">
          <div className="text-xs font-semibold text-app-label-secondary">المبيعات المفتوحة</div>
          <div className="text-xl font-bold font-mono text-app-label-primary mt-1">{money(summary.open_sales_outstanding)}</div>
          <div className="text-[11px] text-app-label-secondary mt-0.5">
            <span className="font-mono">{summary.open_sales_count}</span> فاتورة غير مسددة
          </div>
        </div>
      </div>
    </div>
  );
};

/** The summary's open sales (oldest first): what is unpaid on each, when it fell due and how late it is. */
const OpenSalesList: React.FC<{
  summary?: ClientSummary;
  isLoading: boolean;
  isError: boolean;
  onOpen: (sale: ClientOpenSale) => void;
}> = ({ summary, isLoading, isError, onOpen }) => {
  if (isError) {
    return <p className="p-4 text-xs text-app-status-danger">تعذر تحميل المبيعات المفتوحة.</p>;
  }
  if (isLoading || !summary) {
    return <p className="p-4 text-xs text-app-label-secondary">جارٍ التحميل…</p>;
  }
  if (summary.open_sales.length === 0) {
    return <p className="p-4 text-xs text-app-label-secondary">لا توجد مبيعات غير مسددة لهذا العميل.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-app-fill-f1 text-app-label-secondary">
          <tr>
            <th className="px-3 py-2 text-right font-semibold">رقم الفاتورة</th>
            <th className="px-3 py-2 text-right font-semibold">التاريخ</th>
            <th className="px-3 py-2 text-right font-semibold">الإجمالي</th>
            <th className="px-3 py-2 text-right font-semibold">المرتجع</th>
            <th className="px-3 py-2 text-right font-semibold">المدفوع</th>
            <th className="px-3 py-2 text-right font-semibold">المتبقي</th>
            <th className="px-3 py-2 text-right font-semibold">تاريخ الاستحقاق</th>
            <th className="px-3 py-2 text-right font-semibold">أيام التأخير</th>
          </tr>
        </thead>
        <tbody>
          {summary.open_sales.map((s) => {
            const late = s.days_overdue > 0;
            return (
              <tr
                key={s.id}
                onClick={() => onOpen(s)}
                className={`cursor-pointer border-t border-app-separator hover:bg-app-fill-f1 ${
                  late ? "bg-app-status-danger/5" : ""
                }`}
              >
                <td className="px-3 py-2 font-mono text-app-label-primary">{s.order_number}</td>
                <td className="px-3 py-2 font-mono">{formatDate(s.date)}</td>
                <td className="px-3 py-2 font-mono">{money(s.total_amount)}</td>
                <td className="px-3 py-2 font-mono">{money(s.returned_amount)}</td>
                <td className="px-3 py-2 font-mono">{money(s.amount_paid)}</td>
                <td className="px-3 py-2 font-mono font-semibold text-app-label-primary">{money(s.outstanding)}</td>
                <td className="px-3 py-2 font-mono">{formatDate(s.due_date)}</td>
                <td className={`px-3 py-2 font-mono ${late ? "font-semibold text-app-status-danger" : "text-app-label-tertiary"}`}>
                  {late ? s.days_overdue : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

/** How many of the client's next unpaid installments the card lists. */
const UPCOMING_INSTALLMENTS_SHOWN = 5;

/**
 * W5-08: the client's unpaid installments (oldest due first) with what is left and what is late;
 * shown only when the client has some and the user may read the installments report.
 */
const UpcomingInstallmentsCard: React.FC<{
  clientId: string;
  /** Omitted when the user cannot open a sale's page (e.g. accounting); the rows are then read-only. */
  onOpenSale?: (saleId: string) => void;
  onShowAll: () => void;
}> = ({
  clientId,
  onOpenSale,
  onShowAll,
}) => {
  const { canAccess } = usePermissions();
  const allowed = canAccess({ allowedRoles: INSTALLMENT_ROLES, permission: INSTALLMENT_PERMISSION });
  const { data } = useInstallments({ status: "due", client_id: clientId }, allowed);
  const rows = data?.data ?? [];
  if (!allowed || rows.length === 0 || !data) return null;
  const overdue = Number(data.totals.overdue);

  return (
    <div className="bg-app-bg-primary rounded-2xl border border-app-separator shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-app-separator px-4 py-3">
        <h2 className="flex items-center gap-2 text-xs font-bold text-app-label-primary">
          <CalendarClock className="h-4 w-4 text-app-accent" /> الأقساط غير المسددة
        </h2>
        <span className="text-[11px] text-app-label-secondary">
          <span className="font-mono">{data.totals.count}</span> قسط · المتبقي{" "}
          <span className="font-mono font-semibold text-app-label-primary">{money(data.totals.remaining)}</span>
          {overdue > 0.0001 && (
            <>
              {" "}· متأخر <span className="font-mono font-semibold text-app-status-danger">{money(overdue)}</span>
            </>
          )}
        </span>
        <button type="button" onClick={onShowAll} className="ms-auto text-[11px] font-semibold text-app-accent hover:underline">
          عرض الكل
        </button>
      </div>
      <table className="w-full text-xs">
        <thead className="bg-app-fill-f1 text-app-label-secondary">
          <tr>
            <th className="px-3 py-2 text-start font-semibold">تاريخ الاستحقاق</th>
            <th className="px-3 py-2 text-start font-semibold">رقم البيع</th>
            <th className="px-3 py-2 text-start font-semibold">القسط</th>
            <th className="px-3 py-2 text-end font-semibold">المتبقي</th>
            <th className="px-3 py-2 text-start font-semibold">الحالة</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, UPCOMING_INSTALLMENTS_SHOWN).map((r) => (
            <tr
              key={r.id}
              onClick={onOpenSale ? () => onOpenSale(r.sales_order_id) : undefined}
              className={`border-t border-app-separator ${onOpenSale ? "cursor-pointer hover:bg-app-fill-f1" : ""} ${r.status === "overdue" ? "bg-app-status-danger/5" : ""}`}
            >
              <td className="px-3 py-2 font-mono">{formatDate(r.due_date)}</td>
              <td className="px-3 py-2 font-mono text-app-label-primary">{r.order_number}</td>
              <td className="px-3 py-2 font-mono text-app-label-secondary">{r.number} / {r.installment_count}</td>
              <td className="px-3 py-2 text-end font-mono font-semibold text-app-label-primary">
                {formatNumber(r.remaining, { maximumFractionDigits: 3 })}
              </td>
              <td className="px-3 py-2"><InstallmentStatusChip line={r} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

type Tab = "sales" | "open" | "addresses" | "credit";

/** One client: master data, balance against credit limit, aging, addresses, credit history and every sale made to them. */
export const ClientDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { canAccess } = usePermissions();
  // A sale's page sits under the POS route; accounting reaches the client card but not sales/*.
  const canOpenSale = canAccess(navItems.find((item) => item.id === "pos"));
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState<Tab>("sales");

  const { data: client, isLoading, isError } = useClient(id);
  const { data: salesPage, isLoading: salesLoading } = useSales({ client_id: id, page, per_page: 20 });
  const { data: summary, isLoading: summaryLoading, isError: summaryError } = useClientSummary(id);

  const columns = useSalesColumns({ onOpen: (sale: Sale) => navigate(`/sales/${sale.id}`) });
  const rows = useMemo(() => salesPage?.data ?? [], [salesPage]);
  const table = useDataTable({
    columns,
    data: rows,
    enableSorting: false,
    enableGlobalFilter: false,
    enablePagination: false,
    getRowId: (s) => s.id,
  });

  if (isLoading) {
    return <div className="p-6 text-xs text-app-label-secondary" dir="rtl">جارٍ التحميل…</div>;
  }

  if (isError || !client) {
    return (
      <div className="p-6 space-y-3" dir="rtl">
        <p className="text-sm text-app-status-danger">تعذر تحميل بيانات العميل.</p>
        <button onClick={() => navigate("/clients")} className="text-xs text-app-accent">العودة إلى العملاء</button>
      </div>
    );
  }

  const entity = client.entity;
  const phone = entity?.primary_contact?.phone ?? entity?.phone;

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/clients")}
            className="rounded-xl border border-app-separator bg-app-bg-secondary p-2 hover:bg-app-fill-f1 transition-colors"
            aria-label="رجوع"
          >
            <ArrowRight className="w-4 h-4 text-app-label-secondary" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-app-label-primary flex items-center gap-2">
              <User className="w-6 h-6 text-app-accent" />
              {entity?.name ?? "عميل"}
            </h1>
            <p className="text-xs text-app-label-secondary mt-1">
              {STATUS_LABEL[client.status] ?? client.status}
              {client.operating_unit?.name ? ` · ${client.operating_unit.name}` : ""}
            </p>
          </div>
        </div>

        <button
          onClick={() => navigate(`/reports/debtors?client_id=${encodeURIComponent(client.id)}`)}
          className="inline-flex items-center gap-2 rounded-xl border border-app-separator bg-app-bg-secondary px-3.5 py-2 text-xs font-medium text-app-label-primary hover:bg-app-fill-f1 transition-colors"
        >
          <FileSpreadsheet className="w-4 h-4 text-app-accent" />
          كشف الحساب
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-app-bg-primary p-4 rounded-2xl border border-app-separator shadow-sm">
          <div className="text-xs font-semibold text-app-label-secondary">الرصيد الحالي</div>
          <div className="text-xl font-bold font-mono text-app-label-primary mt-1">{money(client.current_balance)}</div>
        </div>
        <div className="bg-app-bg-primary p-4 rounded-2xl border border-app-separator shadow-sm">
          <div className="text-xs font-semibold text-app-label-secondary">حد الائتمان</div>
          <div className="text-xl font-bold font-mono text-app-label-primary mt-1">{money(client.credit_limit)}</div>
        </div>
        <div className="bg-app-bg-primary p-4 rounded-2xl border border-app-separator shadow-sm">
          <div className="text-xs font-semibold text-app-label-secondary">مدة السداد</div>
          <div className="text-xl font-bold font-mono text-app-label-primary mt-1">{client.payment_terms_days} يوم</div>
        </div>
      </div>

      <div className="bg-app-bg-primary p-5 rounded-2xl border border-app-separator shadow-sm grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Field label="النوع">{entity ? ENTITY_TYPE_LABEL[entity.entity_type] ?? entity.entity_type : "—"}</Field>
        <Field label="الرقم الضريبي">{entity?.tax_number || "—"}</Field>
        <Field label="الهاتف"><span dir="ltr">{phone || "—"}</span></Field>
        <Field label="المدينة">{entity?.city || "—"}</Field>
        <Field label="العنوان">{entity?.address || "—"}</Field>
        <Field label="المجموعة">{client.client_group?.name ?? "—"}</Field>
        <Field label="الحساب">
          {client.account ? (
            <span><span className="font-mono">{client.account.account_code}</span> {client.account.name}</span>
          ) : "—"}
        </Field>
      </div>

      <AgingWidgets summary={summary} isLoading={summaryLoading} isError={summaryError} />

      <UpcomingInstallmentsCard
        clientId={client.id}
        onOpenSale={canOpenSale ? (saleId) => navigate(`/sales/${saleId}`) : undefined}
        onShowAll={() => navigate(`/installments?client_id=${encodeURIComponent(client.id)}`)}
      />

      <div className="flex flex-wrap gap-2">
        {([
          ["sales", "المبيعات", ShoppingCart],
          ["open", "المبيعات المفتوحة", Clock],
          ["addresses", "عناوين التوصيل", MapPin],
          ["credit", "سجل حد الائتمان", History],
        ] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${
              tab === key ? "bg-app-accent text-white" : "bg-app-fill-f1 text-app-label-secondary hover:bg-app-fill-f2"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {tab === "open" ? (
        <div className="bg-app-bg-primary rounded-2xl border border-app-separator shadow-sm overflow-hidden">
          <OpenSalesList
            summary={summary}
            isLoading={summaryLoading}
            isError={summaryError}
            onOpen={(s) => navigate(`/sales/${s.id}`)}
          />
        </div>
      ) : tab === "addresses" ? (
        <div className="bg-app-bg-primary rounded-2xl border border-app-separator shadow-sm overflow-hidden">
          <ClientAddressesTab clientId={client.id} />
        </div>
      ) : tab === "credit" ? (
        <div className="bg-app-bg-primary rounded-2xl border border-app-separator shadow-sm overflow-hidden">
          <ClientCreditHistoryTab clientId={client.id} />
        </div>
      ) : (
        <div className="space-y-3">
          <DataTable table={table}>
            <DataTable.Content
              isLoading={salesLoading}
              emptyMessage="لا توجد مبيعات لهذا العميل."
              emptyIcon={ShoppingCart}
              onRowClick={(s: Sale) => navigate(`/sales/${s.id}`)}
            />
          </DataTable>

          {salesPage && salesPage.last_page > 1 && (
            <div className="flex items-center justify-center gap-2 text-xs">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded-lg border border-app-separator px-3 py-1.5 disabled:opacity-40"
              >
                السابق
              </button>
              <span className="text-app-label-secondary">{page} / {salesPage.last_page}</span>
              <button
                onClick={() => setPage((p) => Math.min(salesPage.last_page, p + 1))}
                disabled={page >= salesPage.last_page}
                className="rounded-lg border border-app-separator px-3 py-1.5 disabled:opacity-40"
              >
                التالي
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ClientDetailPage;
